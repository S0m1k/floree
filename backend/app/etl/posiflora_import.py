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

from sqlalchemy import select, text

from app.database import AsyncSessionLocal
from app.services.posiflora import posiflora_request
from app.catalog_models import (
    Store, Image, Category, Specification, SpecificationVariant,
    SpecificationWithVariants, SpecificationVariantPrice, Customer, Bouquet,
)
from app.inventory_models import (
    Item, Vendor, PackingInvoice, PackingInvoiceItem, WriteoffInvoice,
    MarkdownAct, SortingAct, InventoryAct, MovementAct,
)
from app.dictionary_models import (
    UnitOfMeasure, OrderTag, RecipeTag, DiscountReason, CashReason,
    CustomerPreference, CustomerSource, CustomerDealSource, CustomerCelebration,
)
from app.models import Order, Payment
from app.etl import transforms as T


# Posiflora caps page[size] at 100 — a larger value is rejected with
# 422 "Page size must be leas or equal than 100" (their spelling).
PAGE_SIZE = 100


async def _fetch_page(path: str, page: int, size: int = PAGE_SIZE) -> dict:
    sep = "&" if "?" in path else "?"
    return await posiflora_request(
        "GET", f"{path}{sep}page%5Bnumber%5D={page}&page%5Bsize%5D={size}"
    )


async def _fetch_all(path: str, size: int = PAGE_SIZE) -> tuple[list, list]:
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


async def import_bouquets(session) -> int:
    data, _ = await _fetch_all("/v1/bouquets")
    known_swv = set((await session.execute(select(SpecificationWithVariants.id))).scalars().all())
    rows = []
    for r in data:
        b = T.map_bouquet(r)
        if b["spec_with_variants_id"] not in known_swv:
            b["spec_with_variants_id"] = None  # avoid dangling FK
        rows.append(b)
    return await _merge_all(session, Bouquet, rows)


async def import_orders(session) -> int:
    data, _ = await _fetch_all("/v1/orders")
    known_stores = set((await session.execute(select(Store.id))).scalars().all())
    known_sources = set((await session.execute(select(CustomerDealSource.id))).scalars().all())
    rows = []
    for r in data:
        o = T.map_order(r)
        if o["store_id"] not in known_stores:
            o["store_id"] = None
        if o["source_id"] not in known_sources:
            o["source_id"] = None
        rows.append(o)
    return await _merge_all(session, Order, rows)


async def import_order_payments(session) -> int:
    data, _ = await _fetch_all("/v1/payments")
    known_orders = set((await session.execute(select(Order.id))).scalars().all())
    rows = [T.map_order_payment(r) for r in data]
    rows = [r for r in rows if r["order_id"] in known_orders]  # FK safety
    n = await _merge_all(session, Payment, rows)
    # Derive payment_status from confirmed payments — Posiflora's orders
    # collection doesn't expose the payment-gateway lifecycle, only order-payments.
    await session.execute(text(
        "UPDATE orders SET payment_status = 'paid' "
        "WHERE EXISTS ("
        "  SELECT 1 FROM payments WHERE payments.order_id = orders.id "
        "  AND payments.status = 'CONFIRMED'"
        ")"
    ))
    await session.commit()
    return n


# reference dictionaries: (Posiflora path, model)
_DICTS = [
    ("order-tags", OrderTag),
    ("recipe-tags", RecipeTag),
    ("discount-reasons", DiscountReason),
    ("cash-reasons", CashReason),
    ("customer-preferences", CustomerPreference),
    ("customer-sources", CustomerSource),
    ("order-sources", CustomerDealSource),
    ("customer-celebrations", CustomerCelebration),
]


async def import_dictionaries(session) -> int:
    total = 0
    for path, model in _DICTS:
        try:
            data, _ = await _fetch_all(f"/v1/{path}")
        except Exception as e:  # tolerate a missing/renamed dictionary endpoint
            print(f"  [skip {path}] {e}")
            continue
        total += await _merge_all(session, model, [T.map_dictionary_simple(r) for r in data])
    return total


# warehouse document headers: (Posiflora path, model, header mapper)
_DOCS = [
    ("packing-invoices", PackingInvoice, T.map_packing_invoice),
    ("write-off-invoices", WriteoffInvoice, T.map_writeoff_invoice),
    ("markdown-acts", MarkdownAct, T.map_markdown_act),
    ("sorting-acts", SortingAct, T.map_sorting_act),
    ("inventory-acts", InventoryAct, T.map_inventory_act),
    ("movement-acts", MovementAct, T.map_movement_act),
]


async def import_warehouse_docs(session) -> int:
    total = 0
    for path, model, mapper in _DOCS:
        try:
            data, _ = await _fetch_all(f"/v1/{path}")
        except Exception as e:
            print(f"  [skip {path}] {e}")
            continue
        total += await _merge_all(session, model, [mapper(r) for r in data])

    # Packing-invoice lines (only verified line shape) — fetched per document.
    known_items = set((await session.execute(select(Item.id))).scalars().all())
    pack, _ = await _fetch_all("/v1/packing-invoices")
    for d in pack:
        detail = await posiflora_request("GET", f"/v1/packing-invoices/{d['id']}?include=lines")
        lines = [i for i in (detail.get("included") or []) if i.get("type") == "packing-invoice-lines"]
        rows = [T.map_packing_line(l, d["id"]) for l in lines]
        rows = [r for r in rows if r["item_id"] in known_items]  # FK safety
        await _merge_all(session, PackingInvoiceItem, rows)
    return total


async def run() -> None:
    async with AsyncSessionLocal() as session:
        print("stores:", await import_stores(session))
        print("categories:", await import_categories(session))
        print("items(+measures,images):", await import_items(session))
        print("vendors:", await import_vendors(session))
        print("specifications(+graph):", await import_specifications(session))
        print("bouquets:", await import_bouquets(session))
        print("customers:", await import_customers(session))
        # Dictionaries (incl. customer-deal-sources) before orders so
        # import_orders can resolve `source_id` FKs.
        print("dictionaries:", await import_dictionaries(session))
        print("orders:", await import_orders(session))
        print("order-payments:", await import_order_payments(session))
        print("warehouse docs(+packing lines):", await import_warehouse_docs(session))
    print("done.")


if __name__ == "__main__":
    asyncio.run(run())
