"""Phase 3 — import live Posiflora data into our DB.

Fetches each collection over the vendor JSON:API and upserts (merge by id) into
our tables in FK-safe order. Re-runnable (idempotent). Recipe variant graph is
derived per-specification because the SWV collection exposes neither its parent
spec nor prices.

Run on the server (needs Posiflora creds + DATABASE_URL):
    python -m app.etl.posiflora_import
"""

import asyncio
import os

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete, select, text

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
from app.models import Order, OrderItem, Payment
from app.staff_models import Worker
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


async def import_workers(session) -> int:
    """Staff — needed so orders' createdBy/postedBy resolve to a real name in
    the admin "Автор заказа" column and the "Флорист" filter isn't empty.

    Imported workers get no password_hash/pin_hash (see Worker docstring in
    app/staff_models.py) and can't log into the admin — that's expected, this
    is display-only data. `_merge_all` -> `session.merge()` never touches an
    attribute this transform doesn't set, so re-running the ETL against a
    worker who *did* get a local password later (e.g. hand-provisioned) won't
    clear it.
    """
    data, included = await _fetch_all("/v1/workers?include=user,stores")
    users_by_id = T.index_included_users(included)
    return await _merge_all(session, Worker, [T.map_worker(r, users_by_id) for r in data])


_SPEC_INCLUDE = (
    "include=logo,images,specVariants,specVariants.variant,"
    "specVariants.specVariantPrices&filter%5BactiveVariants%5D=true"
)


def _drop_unknown_author(row: dict, known_workers: set[str]) -> dict:
    if row.get("author_id") not in known_workers:
        row["author_id"] = None
    return row


async def import_specifications(session) -> int:
    known_workers = set((await session.execute(select(Worker.id))).scalars().all())

    listing, listing_inc = await _fetch_all("/v1/specifications?include=logo")
    # logos from the list
    await _merge_all(session, Image, [T.map_image(i) for i in listing_inc if i.get("type") == "images"])
    await _merge_all(session, Specification, [
        _drop_unknown_author(T.map_specification(r), known_workers) for r in listing
    ])

    # Per-spec detail for the variant graph (SWV collection lacks parent + prices).
    n = 0
    for spec in listing:
        detail = await posiflora_request(
            "GET", f"/v1/specifications/{spec['id']}?{_SPEC_INCLUDE}"
        )
        g = T.parse_spec_graph(detail)
        await _merge_all(session, Image, g["images"])
        await _merge_all(session, Specification, [_drop_unknown_author(g["spec"], known_workers)])
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
    known_workers = set((await session.execute(select(Worker.id))).scalars().all())
    customer_lookup = {
        cid: {"name": name, "phone": phone}
        for cid, name, phone in (
            await session.execute(select(Customer.id, Customer.name, Customer.phone))
        ).all()
    }
    known_customers = set(customer_lookup.keys())
    rows = []
    for r in data:
        o = T.map_order(r, customer_lookup)
        if o["store_id"] not in known_stores:
            o["store_id"] = None
        if o["source_id"] not in known_sources:
            o["source_id"] = None
        if o["customer_id"] not in known_customers:
            o["customer_id"] = None
        if o["created_by_id"] not in known_workers:
            o["created_by_id"] = None
        if o["closed_by_id"] not in known_workers:
            o["closed_by_id"] = None
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


_LINES_PROGRESS_EVERY = 100


async def import_order_lines(session) -> tuple[int, int]:
    """Order composition (order card «Продукты» tab) — Posiflora exposes it only
    on the per-order detail endpoint (`GET /v1/orders/{id}?include=lines`), so
    this is one HTTP request per order (~2051 on the live account as of
    2026-07-18) instead of a single paginated collection fetch like every
    other importer here.

    Must run after import_orders (order_id FK), import_bouquets (bouquet_id
    FK — a multi-line bouquet group is folded into one synthetic top-level
    row per transforms.build_order_item_rows) and import_items (inventory_item_id
    FK + titles).

    Idempotent: existing order_items for an order are deleted before its fresh
    rows are inserted (handles a line disappearing from Posiflora between
    runs, not just changed values) — see build_order_item_rows for why plain
    ids are otherwise stable enough for a merge.

    Resilient: a single order's HTTP/parsing failure is caught, logged and
    skipped — it does not abort the run. Progress prints every
    _LINES_PROGRESS_EVERY orders.

    ETL_ORDER_LINES_LIMIT env var caps how many orders are processed (for a
    quick smoke run without a full 2000+-request pass); unset/non-numeric/<=0
    means no limit.
    """
    order_ids = (await session.execute(select(Order.id))).scalars().all()

    try:
        limit = int(os.environ.get("ETL_ORDER_LINES_LIMIT") or 0)
    except ValueError:
        limit = 0
    if limit > 0:
        order_ids = order_ids[:limit]

    item_titles = dict((await session.execute(select(Item.id, Item.title))).all())
    bouquet_titles = dict((await session.execute(select(Bouquet.id, Bouquet.title))).all())
    measure_titles = dict((await session.execute(select(UnitOfMeasure.id, UnitOfMeasure.title))).all())
    known_items = set(item_titles.keys())
    known_bouquets = set(bouquet_titles.keys())

    total = len(order_ids)
    orders_ok = 0
    orders_failed = 0
    rows_created = 0

    for i, order_id in enumerate(order_ids, start=1):
        try:
            detail = await posiflora_request("GET", f"/v1/orders/{order_id}?include=lines")
            lines = [x for x in (detail.get("included") or []) if x.get("type") == "order-lines"]

            await session.execute(delete(OrderItem).where(OrderItem.order_id == order_id))

            rows = T.build_order_item_rows(order_id, lines, item_titles, bouquet_titles, measure_titles)
            for r in rows:
                if r["bouquet_id"] and r["bouquet_id"] not in known_bouquets:
                    r["bouquet_id"] = None
                if r["inventory_item_id"] and r["inventory_item_id"] not in known_items:
                    r["inventory_item_id"] = None

            # Bouquet parent rows first so component rows' parent_id FK
            # resolves — order_items.parent_id has no ORM relationship() to
            # drive automatic dependency ordering (see OrderItem docstring),
            # so this is done explicitly with a flush in between.
            for r in rows:
                if r["kind"] == "bouquet":
                    await session.merge(OrderItem(**r))
            await session.flush()
            for r in rows:
                if r["kind"] != "bouquet":
                    await session.merge(OrderItem(**r))
            await session.flush()

            await session.commit()
            rows_created += len(rows)
            orders_ok += 1
        except Exception as e:
            await session.rollback()
            orders_failed += 1
            print(f"  [order-lines] order {order_id} failed: {e}")

        if i % _LINES_PROGRESS_EVERY == 0 or i == total:
            print(
                f"  order-lines progress: {i}/{total} orders "
                f"(ok={orders_ok} failed={orders_failed} rows={rows_created})"
            )

    return orders_ok, rows_created


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


# warehouse document headers: (Posiflora path, model, header mapper, FK column
# holding a workers.id — differs per table: worker_id vs author_id).
_DOCS = [
    ("packing-invoices", PackingInvoice, T.map_packing_invoice, "worker_id"),
    ("write-off-invoices", WriteoffInvoice, T.map_writeoff_invoice, "worker_id"),
    ("markdown-acts", MarkdownAct, T.map_markdown_act, "author_id"),
    ("sorting-acts", SortingAct, T.map_sorting_act, "author_id"),
    ("inventory-acts", InventoryAct, T.map_inventory_act, "worker_id"),
    ("movement-acts", MovementAct, T.map_movement_act, "worker_id"),
]


async def import_warehouse_docs(session) -> int:
    total = 0
    known_workers = set((await session.execute(select(Worker.id))).scalars().all())
    for path, model, mapper, worker_field in _DOCS:
        try:
            data, _ = await _fetch_all(f"/v1/{path}")
        except Exception as e:
            print(f"  [skip {path}] {e}")
            continue
        rows = [mapper(r) for r in data]
        for r in rows:
            if r.get(worker_field) not in known_workers:
                r[worker_field] = None
        total += await _merge_all(session, model, rows)

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
        # Workers only depend on stores (already imported) and must precede
        # specifications (author_id), orders (created_by_id/closed_by_id) and
        # warehouse docs (worker_id/author_id) so those FKs resolve instead of
        # being dropped by each importer's FK-safety check.
        print("workers:", await import_workers(session))
        print("specifications(+graph):", await import_specifications(session))
        print("bouquets:", await import_bouquets(session))
        print("customers:", await import_customers(session))
        # Dictionaries (incl. customer-deal-sources) before orders so
        # import_orders can resolve `source_id` FKs.
        print("dictionaries:", await import_dictionaries(session))
        print("orders:", await import_orders(session))
        print("order-payments:", await import_order_payments(session))
        # Order composition — needs orders, bouquets and items already imported
        # (FKs); see import_order_lines docstring for why this is one request
        # per order rather than a paginated collection fetch.
        orders_ok, lines_created = await import_order_lines(session)
        print(f"order-lines: {orders_ok} orders, {lines_created} rows")
        print("warehouse docs(+packing lines):", await import_warehouse_docs(session))
    print("done.")


if __name__ == "__main__":
    asyncio.run(run())
