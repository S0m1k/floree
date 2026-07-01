"""Phase 3 — import live Posiflora data into our DB.

Fetches each collection over the vendor JSON:API and upserts (merge by id) into
our tables in FK-safe order. Re-runnable (idempotent). Recipe variant graph is
derived per-specification because the SWV collection exposes neither its parent
spec nor prices.

Run on the server (needs Posiflora creds + DATABASE_URL):
    python -m app.etl.posiflora_import
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.services.posiflora import posiflora_request
from app.catalog_models import (
    Store, Image, Category, Specification, SpecificationVariant,
    SpecificationWithVariants, SpecificationVariantPrice, Customer,
)
from app.inventory_models import Item, Vendor
from app.dictionary_models import UnitOfMeasure
from app.etl import transforms as T


async def _fetch_page(path: str, page: int, size: int = 200) -> dict:
    sep = "&" if "?" in path else "?"
    return await posiflora_request(
        "GET", f"{path}{sep}page%5Bnumber%5D={page}&page%5Bsize%5D={size}"
    )


async def _fetch_all(path: str, size: int = 200) -> tuple[list, list]:
    """Return (data, included) across all pages."""
    data, included, page = [], [], 1
    while True:
        payload = await _fetch_page(path, page, size)
        rows = payload.get("data") or []
        data.extend(rows)
        included.extend(payload.get("included") or [])
        total = (payload.get("meta") or {}).get("total")
        if not rows or (total is not None and len(data) >= total):
            break
        page += 1
    return data, included


async def _merge_all(session: AsyncSession, model, rows: list[dict]) -> int:
    for r in rows:
        await session.merge(model(**r))
    await session.commit()
    return len(rows)


async def import_stores(session) -> int:
    data, _ = await _fetch_all("/v1/stores")
    return await _merge_all(session, Store, [T.map_store(r) for r in data])


async def import_categories(session) -> int:
    data, _ = await _fetch_all("/v1/categories")
    # Parents before children so parent_id FK resolves on insert.
    data.sort(key=lambda r: len((r.get("attributes") or {}).get("pathIds") or []))
    return await _merge_all(session, Category, [T.map_category(r) for r in data])


async def import_items(session) -> int:
    data, included = await _fetch_all("/v1/inventory-items?include=measure,logo,category")
    # measures + images arrive only via includes
    measures = [T.map_measure(i) for i in included if i.get("type") == "measures"]
    images = [T.map_image(i) for i in included if i.get("type") == "images"]
    await _merge_all(session, UnitOfMeasure, measures)
    await _merge_all(session, Image, images)
    return await _merge_all(session, Item, [T.map_item(r) for r in data])


async def import_vendors(session) -> int:
    data, _ = await _fetch_all("/v1/vendors")
    return await _merge_all(session, Vendor, [T.map_vendor(r) for r in data])


async def import_customers(session) -> int:
    data, _ = await _fetch_all("/v1/customers")
    return await _merge_all(session, Customer, [T.map_customer(r) for r in data])


_SPEC_INCLUDE = (
    "include=logo,images,specVariants,specVariants.variant,"
    "specVariants.specVariantPrices&filter%5BactiveVariants%5D=true"
)


async def import_specifications(session) -> int:
    listing, listing_inc = await _fetch_all("/v1/specifications?include=logo")
    # logos from the list
    await _merge_all(session, Image, [T.map_image(i) for i in listing_inc if i.get("type") == "images"])
    await _merge_all(session, Specification, [T.map_specification(r) for r in listing])

    # Per-spec detail for the variant graph (SWV collection lacks parent + prices).
    n = 0
    for spec in listing:
        detail = await posiflora_request(
            "GET", f"/v1/specifications/{spec['id']}?{_SPEC_INCLUDE}"
        )
        g = T.parse_spec_graph(detail)
        await _merge_all(session, Image, g["images"])
        await _merge_all(session, Specification, [g["spec"]])
        await _merge_all(session, SpecificationVariant, g["variants"])
        await _merge_all(session, SpecificationWithVariants, g["swvs"])
        await _merge_all(session, SpecificationVariantPrice, g["prices"])
        n += 1
    return n


async def run() -> None:
    async with AsyncSessionLocal() as session:
        print("stores:", await import_stores(session))
        print("categories:", await import_categories(session))
        print("items(+measures,images):", await import_items(session))
        print("vendors:", await import_vendors(session))
        print("specifications(+graph):", await import_specifications(session))
        print("customers:", await import_customers(session))
    print("done.")


if __name__ == "__main__":
    asyncio.run(run())
