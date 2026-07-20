"""Phase 2 — Posiflora-compatible /v1 endpoints for stores, customers, bouquets."""

import json
import uuid
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import Store, Customer, Bouquet, CustomerBonusHistory
from app.inventory_models import Item
from app.models import (
    Order,
    OrderItem,
    Payment,
    OrderStatusHistory,
    ORDER_STATUSES,
    TERMINAL_STATUSES,
    DELIVERY_TYPES,
    ORDER_ITEM_KINDS,
    DEFAULT_MEASURE,
    PAYMENT_METHODS,
    SETTLED_PAYMENT_STATUSES,
)
from app.dictionary_models import OrderTag, DiscountReason, CustomerPreference
from app.staff_models import Worker
from app.jsonapi import document
from app.serializers import (
    store_resource,
    customer_resource,
    bouquet_resource,
    order_resource,
    order_item_resource,
    order_payment_resource,
    order_status_history_resource,
    dictionary_resource,
)

from app.deps import get_current_worker

COMMENT_MAX_LEN = 500

router = APIRouter(
    prefix="/v1", tags=["v1-sales"], dependencies=[Depends(get_current_worker)]
)


def _page(qs) -> tuple[int, int]:
    def _int(key, default):
        try:
            return int(qs.get(key, default))
        except (TypeError, ValueError):
            return default
    return _int("page[number]", 1), _int("page[size]", 200)


async def _list(db, model, serializer, request, where=None):
    number, size = _page(request.query_params)
    base = select(model)
    if where is not None:
        base = base.where(where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.offset((number - 1) * size).limit(size))).scalars().all()
    data = [serializer(r) for r in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/stores")
async def list_stores(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, Store, store_resource, request)


@router.get("/stores/{store_id}")
async def get_store(store_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Store).where(Store.id == store_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Store not found")
    return document(store_resource(row))


async def _customer_order_stats(db: AsyncSession, customers: list) -> dict[str, dict]:
    """Per-customer order aggregates, keyed by customer id.

    An order belongs to a customer when its customer_id FK matches; legacy
    ETL/checkout rows carry no customer_id and are matched by the customer's
    phone instead. Two grouped queries total (no N+1), merged here — an order
    is counted exactly once (by FK when present, by phone only when the FK is
    NULL).
    """
    if not customers:
        return {}
    totals: dict[str, list] = {c.id: [0, 0.0] for c in customers}

    by_id = (
        await db.execute(
            select(Order.customer_id, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
            .where(Order.customer_id.in_(list(totals)))
            .group_by(Order.customer_id)
        )
    ).all()
    for cid, count, total in by_id:
        totals[cid][0] += count
        totals[cid][1] += float(total)

    # First customer wins a shared phone — mirrors the ETL's dedup rule.
    id_by_phone: dict[str, str] = {}
    for c in customers:
        if c.phone and c.phone not in id_by_phone:
            id_by_phone[c.phone] = c.id
    if id_by_phone:
        by_phone = (
            await db.execute(
                select(Order.phone, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
                .where(Order.customer_id.is_(None), Order.phone.in_(list(id_by_phone)))
                .group_by(Order.phone)
            )
        ).all()
        for phone, count, total in by_phone:
            cid = id_by_phone[phone]
            totals[cid][0] += count
            totals[cid][1] += float(total)

    return {
        cid: {
            "ordersQty": qty,
            "ordersAmount": amount,
            "avgCheck": round(amount / qty, 2) if qty else 0,
        }
        for cid, (qty, amount) in totals.items()
    }


def _parse_amount(raw: str | None, field: str) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be a number")


@router.get("/customers")
async def list_customers(request: Request, db: AsyncSession = Depends(get_db)):
    """List clients for the admin «Клиенты» screen (admin-map §2.5.1).

    Most filters translate straight to a WHERE clause. The purchase-amount
    range (`filter[amountFrom]`/`filter[amountTo]`) is the exception — it
    filters on the per-customer order aggregate, which is only known after
    `_customer_order_stats` runs, so that branch evaluates every matching
    customer's stats up front and paginates in Python instead of in SQL. Fine
    at this scale (hundreds of customers, not millions).
    """
    qs = request.query_params
    number, size = _page(qs)
    base = select(Customer)

    phone = qs.get("filter[phone]")
    if phone:
        base = base.where(Customer.phone == phone)
    source = qs.get("filter[source]")
    if source:
        base = base.where(Customer.source_id == source)
    gender = qs.get("filter[gender]")
    if gender:
        base = base.where(Customer.gender == gender)
    customer_type = qs.get("filter[customerType]")
    if customer_type:
        base = base.where(Customer.customer_type == customer_type)
    registered_from = qs.get("filter[registeredFrom]")
    if registered_from:
        base = base.where(Customer.created_at >= datetime.fromisoformat(registered_from))
    registered_to = qs.get("filter[registeredTo]")
    if registered_to:
        base = base.where(Customer.created_at < datetime.fromisoformat(registered_to) + timedelta(days=1))
    q = qs.get("q")
    if q:
        like = f"%{q}%"
        base = base.where(or_(Customer.name.ilike(like), Customer.phone.ilike(like)))

    # `preferences` is a free-text field on Customer (no M2M to the
    # customer-preferences dictionary exists), so the filter resolves the
    # dictionary id to its title and matches customers whose free-text
    # preferences contain it. An unknown id matches nothing.
    preference_id = qs.get("filter[preferences]")
    if preference_id:
        pref = (
            await db.execute(
                select(CustomerPreference).where(CustomerPreference.id == preference_id)
            )
        ).scalar_one_or_none()
        if pref is None:
            base = base.where(Customer.id.is_(None))
        else:
            base = base.where(Customer.preferences.ilike(f"%{pref.title}%"))

    amount_from = _parse_amount(qs.get("filter[amountFrom]"), "filter[amountFrom]")
    amount_to = _parse_amount(qs.get("filter[amountTo]"), "filter[amountTo]")

    if amount_from is None and amount_to is None:
        total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (
            await db.execute(base.order_by(Customer.created_at.desc()).offset((number - 1) * size).limit(size))
        ).scalars().all()
        stats_by_id = await _customer_order_stats(db, list(rows))
        data = [customer_resource(r, stats_by_id.get(r.id)) for r in rows]
        return document(data, meta={"page": {"number": number, "size": size}, "total": total})

    all_rows = (
        await db.execute(base.order_by(Customer.created_at.desc()))
    ).scalars().all()
    stats_by_id = await _customer_order_stats(db, list(all_rows))

    def _in_range(row) -> bool:
        amount = stats_by_id.get(row.id, {}).get("ordersAmount", 0)
        if amount_from is not None and amount < amount_from:
            return False
        if amount_to is not None and amount > amount_to:
            return False
        return True

    filtered = [r for r in all_rows if _in_range(r)]
    total = len(filtered)
    page_rows = filtered[(number - 1) * size: (number - 1) * size + size]
    data = [customer_resource(r, stats_by_id.get(r.id)) for r in page_rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    stats = await _customer_order_stats(db, [row])
    return document(customer_resource(row, stats.get(row.id)))


# The physical-showcase status (Posiflora `window`) is the only one a bouquet
# can be disassembled from; a sold bouquet is a completed sale (409), and any
# other status (already disassembled, freshly created, …) is likewise final
# from this endpoint's point of view.
BOUQUET_WINDOW_STATUS = "window"
BOUQUET_DISASSEMBLED_STATUS = "disassembled"

_BOUQUET_SORT_COLUMNS = {
    "amount": Bouquet.sale_amount.asc(),
    "-amount": Bouquet.sale_amount.desc(),
    "title": Bouquet.title.asc(),
    "-title": Bouquet.title.desc(),
    "createdAt": Bouquet.created_at.asc(),
    "-createdAt": Bouquet.created_at.desc(),
}


def _bouquet_filters(qs) -> list:
    clauses = []
    store = qs.get("filter[store]")
    if store:
        clauses.append(Bouquet.store_id == store)
    status = qs.get("filter[status]")
    if status:
        clauses.append(Bouquet.status == status)
    q = qs.get("q")
    if q:
        like = f"%{q}%"
        clauses.append(or_(Bouquet.title.ilike(like), Bouquet.id.ilike(like)))
    return clauses


@router.get("/bouquets")
async def list_bouquets(request: Request, db: AsyncSession = Depends(get_db)):
    """Showcase bouquets (admin-map §2.3.1 «Букеты в магазине»).

    `meta` carries the aggregates the summary tabs need — `count`/`minPrice`/
    `maxPrice`/`totalSum` are computed over every bouquet matching the current
    filters (before pagination), not just the current page.
    """
    qs = request.query_params
    number, size = _page(qs)
    clauses = _bouquet_filters(qs)

    base = select(Bouquet)
    for clause in clauses:
        base = base.where(clause)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    sort = qs.get("sort", "-createdAt")
    order_by = _BOUQUET_SORT_COLUMNS.get(sort, Bouquet.created_at.desc())
    rows = (
        await db.execute(base.order_by(order_by).offset((number - 1) * size).limit(size))
    ).scalars().all()
    data = [bouquet_resource(r) for r in rows]

    agg_stmt = select(
        func.count(),
        func.min(Bouquet.sale_amount),
        func.max(Bouquet.sale_amount),
        func.coalesce(func.sum(Bouquet.sale_amount), 0),
    ).select_from(Bouquet)
    for clause in clauses:
        agg_stmt = agg_stmt.where(clause)
    count, min_price, max_price, total_sum = (await db.execute(agg_stmt)).one()

    return document(data, meta={
        "page": {"number": number, "size": size},
        "total": total,
        "count": count,
        "minPrice": float(min_price) if min_price is not None else 0.0,
        "maxPrice": float(max_price) if max_price is not None else 0.0,
        "totalSum": float(total_sum),
    })


@router.get("/bouquets/{bouquet_id}")
async def get_bouquet(bouquet_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Bouquet).where(Bouquet.id == bouquet_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Bouquet not found")
    return document(bouquet_resource(row))


@router.patch("/bouquets/{bouquet_id}")
async def update_bouquet_v1(bouquet_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """«Разобрать букет» (admin-map §2.3.1) — the only mutation this endpoint
    supports right now. Only a bouquet currently on the showcase (`window`)
    can be disassembled; a sold bouquet is a completed sale and any other
    status is likewise a 409 (nothing else transitions through here).
    """
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    new_status = attrs.get("status")
    if new_status != BOUQUET_DISASSEMBLED_STATUS:
        raise HTTPException(
            status_code=400, detail=f"status must be '{BOUQUET_DISASSEMBLED_STATUS}'"
        )

    bouquet = (
        await db.execute(select(Bouquet).where(Bouquet.id == bouquet_id))
    ).scalar_one_or_none()
    if bouquet is None:
        raise HTTPException(status_code=404, detail="Bouquet not found")

    if bouquet.status != BOUQUET_WINDOW_STATUS:
        raise HTTPException(
            status_code=409,
            detail=f"Bouquet is in status '{bouquet.status}' and cannot be disassembled",
        )

    bouquet.status = BOUQUET_DISASSEMBLED_STATUS
    await db.commit()
    await db.refresh(bouquet)
    return document(bouquet_resource(bouquet))


def _order_filters(qs, *, include_status: bool):
    """Build the WHERE clauses for /v1/orders shared by the list and the
    per-tab status counts (admin "Заказы" — docs/posiflora/admin-map.md §2.2).
    `include_status` is False when counting each status tab, since a tab's
    count must reflect every other active filter but not itself.
    """
    clauses = []
    if include_status:
        status = qs.get("filter[status]")
        if status:
            clauses.append(Order.status == status)
    for key, column in (
        ("store", Order.store_id),
        ("source", Order.source_id),
        ("florist", Order.florist_id),
        ("createdBy", Order.created_by_id),
        ("closedBy", Order.closed_by_id),
    ):
        value = qs.get(f"filter[{key}]")
        if value:
            clauses.append(column == value)

    tag = qs.get("filter[tag]")
    if tag:
        # tags_json is a JSON array of order-tag ids, e.g. '["<id1>","<id2>"]'.
        # There is no JSON column type available here portably (SQLite in tests,
        # Postgres in prod), so a LIKE substring match on the quoted id is the
        # reliable option — every id is a fixed-length UUID, so one id can never
        # be a substring of another, and matching the surrounding quotes rules
        # out a false-positive substring match against a longer, unrelated id.
        clauses.append(Order.tags_json.like(f'%"{tag}"%'))

    def _date_range(prefix: str, column):
        from_str, to_str = qs.get(f"filter[{prefix}From]"), qs.get(f"filter[{prefix}To]")
        if from_str:
            clauses.append(column >= datetime.fromisoformat(from_str))
        if to_str:
            # inclusive end-of-day
            clauses.append(column < datetime.fromisoformat(to_str) + timedelta(days=1))

    _date_range("created", Order.created_at)
    _date_range("closed", Order.closed_at)
    # due_time is a free-form ISO string (may be null); string comparison is a
    # reasonable approximation since values share the same offset format.
    due_from, due_to = qs.get("filter[dueFrom]"), qs.get("filter[dueTo]")
    if due_from:
        clauses.append(Order.due_time >= due_from)
    if due_to:
        clauses.append(Order.due_time <= due_to + "T23:59:59")

    q = qs.get("q")
    if q:
        like = f"%{q}%"
        clauses.append(or_(
            Order.posiflora_doc_no.ilike(like),
            Order.customer_name.ilike(like),
            Order.phone.ilike(like),
            Order.comment.ilike(like),
        ))
    return clauses


async def _order_customer_clauses(db: AsyncSession, qs) -> list:
    """filter[customer] — the customer card's «Заказы» tab. An order belongs
    to the customer via the customer_id FK, or (legacy ETL rows that predate
    the FK) via the customer's phone.
    """
    customer_id = qs.get("filter[customer]")
    if not customer_id:
        return []
    cust = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if cust is None or not cust.phone:
        return [Order.customer_id == customer_id]
    return [or_(Order.customer_id == customer_id, Order.phone == cust.phone)]


def _order_tag_ids(order: Order) -> list[str]:
    """Быстрые теги» ids for one order (order.tags_json parsed defensively)."""
    try:
        return json.loads(order.tags_json) if order.tags_json else []
    except (TypeError, ValueError):
        return []


async def _resolve_order_tags_included(db: AsyncSession, orders: list[Order]) -> list[dict]:
    """Batch-resolve order-tag titles for a set of orders (no N+1): collects
    every tag id referenced across the given orders' tags_json and loads them
    in a single query, returned as JSON:API `included` resources.
    """
    ids: set[str] = set()
    for o in orders:
        ids.update(_order_tag_ids(o))
    if not ids:
        return []
    rows = (await db.execute(select(OrderTag).where(OrderTag.id.in_(ids)))).scalars().all()
    return [dictionary_resource(t, "order-tags") for t in rows]


@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _page(qs)

    # filter[customer] needs a DB lookup (phone match), so it's resolved once
    # here and appended to every clause set below.
    customer_clauses = await _order_customer_clauses(db, qs)
    filtered_clauses = [*_order_filters(qs, include_status=True), *customer_clauses]

    base = select(Order)
    for clause in filtered_clauses:
        base = base.where(clause)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = (
        base.options(selectinload(Order.payments))
        .order_by(Order.created_at.desc())
        .offset((number - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    data = [order_resource(o) for o in rows]
    included = await _resolve_order_tags_included(db, rows)

    # Status-tab counts honor every filter except `status` itself, so
    # switching tabs doesn't reset the rest of the filter panel.
    no_status_clauses = [*_order_filters(qs, include_status=False), *customer_clauses]

    def _scoped(*extra):
        stmt = select(func.count()).select_from(Order)
        for clause in (*no_status_clauses, *extra):
            stmt = stmt.where(clause)
        return stmt

    status_counts = {}
    for s in ORDER_STATUSES:
        status_counts[s] = (await db.execute(_scoped(Order.status == s))).scalar_one()
    status_counts["all"] = (await db.execute(_scoped())).scalar_one()

    # Aggregates row under the orders table (admin-map §2.2) — computed over
    # every order matching the current filters (including `status`), before
    # pagination.
    agg_stmt = select(
        func.coalesce(func.sum(Order.total_amount), 0),
        func.coalesce(func.sum(Order.budget), 0),
        func.coalesce(func.sum(Order.bonus_paid), 0),
        func.coalesce(func.sum(Order.discount_total), 0),
        func.coalesce(func.sum(Order.markup_total), 0),
    ).select_from(Order)
    for clause in filtered_clauses:
        agg_stmt = agg_stmt.where(clause)
    orders_total, budget_total, bonus_total, discount_total, markup_total = (
        await db.execute(agg_stmt)
    ).one()

    paid_stmt = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .select_from(Order)
        .join(Payment, Payment.order_id == Order.id)
        .where(Payment.status.in_(SETTLED_PAYMENT_STATUSES))
    )
    for clause in filtered_clauses:
        paid_stmt = paid_stmt.where(clause)
    paid_total = (await db.execute(paid_stmt)).scalar_one()

    orders_total_f = float(orders_total)
    paid_total_f = float(paid_total)
    # «Кредит» — outstanding balance across the filtered orders; never negative
    # (a customer that overpaid isn't "owed" a negative credit here).
    credit_total = max(orders_total_f - paid_total_f, 0.0)

    return document(data, included=included, meta={
        "page": {"number": number, "size": size},
        "total": total,
        "statusCounts": status_counts,
        "aggregates": {
            "ordersTotal": orders_total_f,
            "budgetTotal": float(budget_total),
            "paidTotal": paid_total_f,
            "creditTotal": credit_total,
            "bonusTotal": float(bonus_total),
            "discountTotal": float(discount_total),
            "markupTotal": float(markup_total),
        },
    })


@router.get("/orders/{order_id}")
async def get_order_v1(order_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.payments))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    included = await _resolve_order_tags_included(db, [order])
    return document(order_resource(order), included=included)


@router.get("/orders/{order_id}/status-history")
async def get_order_status_history(order_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.changed_at)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return document([order_status_history_resource(h) for h in rows])


def _rel_id(rels: dict, key: str) -> str | None:
    """Extract a to-one relationship id from a JSON:API relationships block."""
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


def _rel_ids(rels: dict, key: str) -> list[str]:
    """Extract to-many relationship ids from a JSON:API relationships block."""
    data = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    if not isinstance(data, list):
        return []
    return [n["id"] for n in data if isinstance(n, dict) and n.get("id")]


async def _load_order(db: AsyncSession, order_id: str) -> Order | None:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.payments))
    return (await db.execute(stmt)).scalar_one_or_none()


# Posiflora's human order numbers are YY######  (year prefix + serial within
# the year, e.g. 26000008) — 8 digits, always < 10^8. The ETL also produced
# junk order_numbers above that ceiling by trimming trailing digits from
# storefront doc numbers (12-digit payment timestamps like 778852657260);
# those must never seed the counter or new orders continue the timestamp run.
ORDER_NUMBER_CEILING = 100_000_000


async def _next_order_number(db: AsyncSession) -> int:
    """Next human order number — continues Posiflora's own YY###### series."""
    current = (
        await db.execute(
            select(func.max(Order.order_number)).where(
                Order.order_number < ORDER_NUMBER_CEILING
            )
        )
    ).scalar_one()
    return int(current or 0) + 1


def _combined_address(attrs: dict) -> str:
    """Build the flat address string the checkout Order stores, from the admin
    form's structured delivery fields — keeps list/search behavior consistent."""
    street, house = attrs.get("deliveryStreet"), attrs.get("deliveryHouse")
    parts = [attrs.get("deliveryCity"), ", ".join(p for p in (street, house) if p)]
    if attrs.get("deliveryApartment"):
        parts.append(f"кв. {attrs['deliveryApartment']}")
    return ", ".join(p for p in parts if p)


@router.post("/orders", status_code=201)
async def create_order_v1(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Create an order from the admin «Создание заказа» form (admin-map §2.2.2).

    Prices/composition are NOT accepted here — «Бюджет» is advisory only and the
    order total stays server-owned (§2.2.1). The server assigns the sequential
    order number, sets status='new', records the author and the first history
    entry, and echoes the same shape as GET /v1/orders/{id}.
    """
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "orders"):
        raise HTTPException(status_code=400, detail="data.type must be 'orders'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    # --- relationships ---
    store_id = _rel_id(rels, "store")
    if not store_id:
        raise HTTPException(status_code=400, detail="store relationship is required")
    store = (await db.execute(select(Store).where(Store.id == store_id))).scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=400, detail="store not found")

    customer = None
    customer_id = _rel_id(rels, "customer")
    if customer_id:
        customer = (
            await db.execute(select(Customer).where(Customer.id == customer_id))
        ).scalar_one_or_none()
        if customer is None:
            raise HTTPException(status_code=400, detail="customer not found")

    source_id = _rel_id(rels, "source") or attrs.get("source")

    # --- attributes ---
    comment = attrs.get("comment") or attrs.get("description")
    if comment is not None and len(comment) > COMMENT_MAX_LEN:
        raise HTTPException(
            status_code=400, detail=f"comment exceeds {COMMENT_MAX_LEN} characters"
        )

    delivery_type = attrs.get("delivery") or attrs.get("deliveryType") or "delivery"
    if delivery_type not in DELIVERY_TYPES:
        raise HTTPException(
            status_code=400, detail=f"delivery must be one of {DELIVERY_TYPES}"
        )

    budget = attrs.get("budget")
    if budget is not None:
        try:
            budget = float(budget)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="budget must be a number")

    tag_ids = _rel_ids(rels, "tags") or (attrs.get("tags") if isinstance(attrs.get("tags"), list) else [])

    order = Order(
        posiflora_id=None,
        posiflora_doc_no=None,
        order_number=await _next_order_number(db),
        customer_name=(customer.name if customer else "") or "",
        phone=(customer.phone if customer else "") or "",
        address=_combined_address(attrs) if delivery_type == "delivery" else "",
        comment=comment,
        status="new",
        payment_status="pending",
        bouquet_ids="[]",
        total_amount=0,
        budget=budget,
        store_id=store_id,
        source_id=source_id,
        customer_id=customer_id,
        created_by_id=worker.id,
        delivery_type=delivery_type,
        delivery_city=attrs.get("deliveryCity"),
        delivery_street=attrs.get("deliveryStreet"),
        delivery_house=attrs.get("deliveryHouse"),
        delivery_apartment=attrs.get("deliveryApartment"),
        delivery_building=attrs.get("deliveryBuilding"),
        delivery_time_from=attrs.get("deliveryTimeFrom"),
        delivery_time_to=attrs.get("deliveryTimeTo"),
        due_date=attrs.get("dueDate"),
        due_time=attrs.get("dueTime"),
        tags_json=json.dumps(tag_ids) if tag_ids else None,
    )
    db.add(order)
    await db.flush()
    db.add(OrderStatusHistory(order_id=order.id, status="new", worker_id=worker.id))
    await db.commit()

    fresh = await _load_order(db, order.id)
    included = await _resolve_order_tags_included(db, [fresh])
    return document(order_resource(fresh), included=included)


@router.patch("/orders/{order_id}")
async def update_order_v1(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Update an order's status and/or card fields (admin-map §2.2.1).

    Posiflora allows free transitions between active statuses, but terminal ones
    (completed/cancelled/return) are read-only for the workflow *status* —
    attempting to move OUT of a terminal status is a 409. Tags, the comment and
    the budget stay editable even once the order is terminal (Posiflora keeps
    the order card's own fields open after it closes) — only the status
    transition itself locks. Every status change appends a history entry;
    terminal moves stamp closed_at / closed_by. Prices/sums are never accepted
    from the client here (memory payment-price-vuln).
    """
    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    order = await _load_order(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    has_status = "status" in attrs
    new_status = attrs.get("status")
    if has_status and new_status not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {ORDER_STATUSES}"
        )

    has_tags = "tags" in rels or "tags" in attrs
    tag_ids: list[str] = []
    if has_tags:
        tag_ids = _rel_ids(rels, "tags") if "tags" in rels else (
            attrs.get("tags") if isinstance(attrs.get("tags"), list) else []
        )
        if tag_ids:
            existing = set(
                (
                    await db.execute(select(OrderTag.id).where(OrderTag.id.in_(tag_ids)))
                ).scalars().all()
            )
            unknown = [t for t in tag_ids if t not in existing]
            if unknown:
                raise HTTPException(
                    status_code=400, detail=f"unknown order tag id(s): {unknown}"
                )

    has_comment = "comment" in attrs or "description" in attrs
    comment = attrs.get("comment", attrs.get("description"))
    if has_comment and comment is not None and len(comment) > COMMENT_MAX_LEN:
        raise HTTPException(
            status_code=400, detail=f"comment exceeds {COMMENT_MAX_LEN} characters"
        )

    has_budget = "budget" in attrs
    budget = attrs.get("budget")
    if has_budget and budget is not None:
        try:
            budget = float(budget)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="budget must be a number")

    if has_status:
        if order.status in TERMINAL_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=f"Order is in terminal status '{order.status}' and cannot be changed",
            )
        order.status = new_status
        if new_status in TERMINAL_STATUSES:
            order.closed_at = datetime.utcnow()
            order.closed_by_id = worker.id
        db.add(OrderStatusHistory(order_id=order.id, status=new_status, worker_id=worker.id))

    if has_tags:
        order.tags_json = json.dumps(tag_ids) if tag_ids else None
    if has_comment:
        order.comment = comment
    if has_budget:
        order.budget = budget

    await db.commit()

    fresh = await _load_order(db, order.id)
    included = await _resolve_order_tags_included(db, [fresh])
    return document(order_resource(fresh), included=included)


@router.get("/payments")
async def list_order_payments(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _page(qs)
    base = select(Payment)
    order_id = qs.get("filter[order]")
    if order_id:
        base = base.where(Payment.order_id == order_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(base.order_by(Payment.created_at).offset((number - 1) * size).limit(size))
    ).scalars().all()
    data = [order_payment_resource(p) for p in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


# ==========================================================================
# Order composition — «Продукты» tab (admin-map.md §2.2.1)
#
# Prices are NEVER accepted from the client: adding a line sends only the id of
# the source (bouquet or nomenclature item); the server reads the price from its
# own catalog and snapshots it onto the line (memory payment-price-vuln). Totals
# and «К оплате» are recomputed server-side on every change.
# ==========================================================================


def _dec(value) -> Decimal:
    """Coerce a stored money/qty value to Decimal (None → 0)."""
    if value is None:
        return Decimal(0)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(0)


def _opt_float(value) -> float | None:
    """Like _dec, but preserves None (for optional display-only percent
    columns, where None means "this discount/markup wasn't set as a percent",
    distinct from 0%)."""
    return None if value is None else float(_dec(value))


# «Скидка/Надбавка» — PUT /orders/{id}/discount (admin-map §2.2.1). The client
# picks kind/target/mode/value/reason only; the resulting money amount is
# always computed server-side (memory payment-price-vuln).
DISCOUNT_MARKUP_KINDS = ("discount", "markup")
DISCOUNT_MARKUP_TARGETS = ("order", "item")
DISCOUNT_MARKUP_MODES = ("percent", "amount")


async def _load_order_full(db: AsyncSession, order_id: str) -> Order | None:
    # populate_existing: after a write in the same request the session already
    # holds this Order with stale items/payments collections; a plain re-select
    # would hand back the cached (non-expired) instance unchanged.
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _settled_advances(payments: list[Payment]) -> Decimal:
    """Money actually received against the order — settled T-Bank payments and
    manual in-store advances (both stored CONFIRMED)."""
    return sum(
        (_dec(p.amount) for p in payments if p.status in SETTLED_PAYMENT_STATUSES),
        Decimal(0),
    )


def _compute_totals(order: Order, items: list[OrderItem], payments: list[Payment]) -> dict:
    """Итоговая панель (admin-map §2.2.1). Top-level rows (parent_id is None)
    drive the money total; component rows are informational detail nested under
    their bouquet, so they are NOT re-added to the sum (the bouquet's own price
    is authoritative). Markup/discount are split into flowers/bouquets/order
    buckets for the «в т.ч.» breakdown.
    """
    top = [it for it in items if it.parent_id is None]
    components = [it for it in items if it.parent_id is not None]

    items_total = sum((_dec(it.unit_price) * _dec(it.quantity) for it in top), Decimal(0))

    markup_flowers = sum((_dec(it.markup) for it in components), Decimal(0)) + sum(
        (_dec(it.markup) for it in top if it.kind != "bouquet"), Decimal(0)
    )
    markup_bouquets = sum((_dec(it.markup) for it in top if it.kind == "bouquet"), Decimal(0))
    markup_order = _dec(order.markup_total)
    markup_total = markup_flowers + markup_bouquets + markup_order

    disc_flowers = sum((_dec(it.discount) for it in components), Decimal(0)) + sum(
        (_dec(it.discount) for it in top if it.kind != "bouquet"), Decimal(0)
    )
    disc_bouquets = sum((_dec(it.discount) for it in top if it.kind == "bouquet"), Decimal(0))
    disc_order = _dec(order.discount_total)
    discount_total = disc_flowers + disc_bouquets + disc_order

    grand_total = items_total - discount_total + markup_total

    bonus_paid = _dec(order.bonus_paid)
    advances = _settled_advances(payments)
    to_pay = grand_total - advances - bonus_paid
    if to_pay < 0:
        to_pay = Decimal(0)

    # «Продуктов» counts individual goods/flowers (leaf product units), not the
    # bouquet wrappers; «Букетов» counts the bouquet rows.
    product_units = sum(
        (_dec(it.quantity) for it in items if it.kind != "bouquet"), Decimal(0)
    )
    bouquets_count = sum(1 for it in top if it.kind == "bouquet")

    def f(d: Decimal) -> float:
        return float(round(d, 2))

    return {
        "productsCount": f(product_units),
        "bouquetsCount": bouquets_count,
        "itemsTotal": f(items_total),
        "discount": f(discount_total),
        "discountBreakdown": {
            "flowers": f(disc_flowers),
            "bouquets": f(disc_bouquets),
            "order": f(disc_order),
        },
        "markup": f(markup_total),
        "markupBreakdown": {
            "flowers": f(markup_flowers),
            "bouquets": f(markup_bouquets),
            "order": f(markup_order),
        },
        # Order-level discount/markup detail — how it was entered (percent vs a
        # flat amount) and its reason, for the «Продукты» summary panel's
        # СКИДКА/НАДБАВКА modals to redisplay the current value when reopened.
        "orderDiscountReasonId": order.discount_reason_id,
        "orderDiscountPercent": _opt_float(order.discount_percent),
        "orderMarkupReasonId": order.markup_reason_id,
        "orderMarkupPercent": _opt_float(order.markup_percent),
        "bonusPaid": f(bonus_paid),
        "advances": f(advances),
        "grandTotal": f(grand_total),
        "toPay": f(to_pay),
    }


def _legacy_composition(order: Order) -> tuple[list[dict], dict] | None:
    """Read-only composition for ETL/checkout orders that predate order_items:
    the priced lines were frozen into order.bouquet_ids JSON. Returns
    (resources, totals) or None when there is no legacy data.
    """
    try:
        lines = json.loads(order.bouquet_ids) if order.bouquet_ids else []
    except (TypeError, ValueError):
        lines = []
    if not isinstance(lines, list) or not lines:
        return None

    resources: list[dict] = []
    product_units = Decimal(0)
    for i, line in enumerate(lines):
        if not isinstance(line, dict):
            continue
        price = _dec(line.get("price"))
        qty = _dec(line.get("qty") or 1)
        product_units += qty
        resources.append({
            "type": "order-items",
            "id": f"legacy-{order.id}-{i}",
            "attributes": {
                "kind": "bouquet",
                "title": line.get("title") or "Позиция",
                "unitPrice": float(round(price, 2)),
                "quantity": float(round(qty, 2)),
                "measure": DEFAULT_MEASURE,
                "markup": 0.0,
                "discount": 0.0,
                "originalSum": float(round(price * qty, 2)),
                "sum": float(round(price * qty, 2)),
                "createdAt": None,
            },
            "relationships": {
                "parent": {"data": None},
                "order": {"data": {"type": "orders", "id": order.id}},
                "bouquet": {"data": None},
                "inventoryItem": {"data": None},
            },
        })

    # Totals come from the authoritative order.total_amount (admin-map: legacy
    # orders keep the imported total; per-line sums are display-only).
    grand_total = _dec(order.total_amount)
    advances = _settled_advances(order.payments)
    bonus_paid = _dec(order.bonus_paid)
    to_pay = grand_total - advances - bonus_paid
    if to_pay < 0:
        to_pay = Decimal(0)

    def f(d: Decimal) -> float:
        return float(round(d, 2))

    totals = {
        "productsCount": f(product_units),
        "bouquetsCount": len(resources),
        "itemsTotal": f(grand_total),
        "discount": 0.0,
        "discountBreakdown": {"flowers": 0.0, "bouquets": 0.0, "order": 0.0},
        "markup": 0.0,
        "markupBreakdown": {"flowers": 0.0, "bouquets": 0.0, "order": 0.0},
        "orderDiscountReasonId": None,
        "orderDiscountPercent": None,
        "orderMarkupReasonId": None,
        "orderMarkupPercent": None,
        "bonusPaid": f(bonus_paid),
        "advances": f(advances),
        "grandTotal": f(grand_total),
        "toPay": f(to_pay),
    }
    return resources, totals


def _sorted_composition(items: list[OrderItem]) -> list[OrderItem]:
    """Order rows so each bouquet parent is immediately followed by its own
    components, then the next top-level row — the order the «Состав заказа»
    table renders top-down."""
    by_parent: dict[str | None, list[OrderItem]] = {}
    for it in items:
        by_parent.setdefault(it.parent_id, []).append(it)
    for group in by_parent.values():
        group.sort(key=lambda x: (x.created_at or datetime.min, x.id))

    ordered: list[OrderItem] = []
    for top in by_parent.get(None, []):
        ordered.append(top)
        ordered.extend(by_parent.get(top.id, []))
    return ordered


async def _composition_response(db: AsyncSession, order: Order) -> dict:
    """Build the GET /orders/{id}/items document: rows + payments + totals."""
    real_items = list(order.items)
    payments = sorted(order.payments, key=lambda p: (p.created_at or datetime.min, p.id))
    payment_resources = [order_payment_resource(p) for p in payments]

    if real_items:
        ordered = _sorted_composition(real_items)
        data = [order_item_resource(it) for it in ordered]
        totals = _compute_totals(order, real_items, order.payments)
        read_only = False
    else:
        legacy = _legacy_composition(order)
        if legacy is not None:
            data, totals = legacy
            read_only = True
        else:
            data = []
            totals = _compute_totals(order, [], order.payments)
            read_only = False

    return document(
        data,
        meta={"totals": totals, "payments": payment_resources, "readOnly": read_only},
    )


@router.get("/orders/{order_id}/items")
async def get_order_items(order_id: str, db: AsyncSession = Depends(get_db)):
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return await _composition_response(db, order)


@router.get("/orders/{order_id}/payments")
async def get_order_payments(order_id: str, db: AsyncSession = Depends(get_db)):
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    payments = sorted(order.payments, key=lambda p: (p.created_at or datetime.min, p.id))
    return document([order_payment_resource(p) for p in payments])


async def _recalc_total(db: AsyncSession, order: Order) -> None:
    """Refresh order.total_amount from the current composition (grandTotal)."""
    await db.refresh(order, ["items", "payments"])
    totals = _compute_totals(order, list(order.items), list(order.payments))
    order.total_amount = Decimal(str(totals["grandTotal"]))


def _current_totals(order: Order) -> dict:
    """Totals for whatever composition the order currently has: real
    order_items (_compute_totals) or, for legacy ETL/checkout orders that
    predate them, the frozen bouquet_ids snapshot (_legacy_composition)."""
    if order.items:
        return _compute_totals(order, list(order.items), list(order.payments))
    legacy = _legacy_composition(order)
    if legacy is not None:
        return legacy[1]
    return _compute_totals(order, [], list(order.payments))


def _bouquet_component_rows(bouquet: Bouquet, parent_id: str) -> list[OrderItem]:
    """Build component rows for a bouquet from its recipe specification.

    The current schema has no per-flower recipe-composition table (specifications
    carry only variant prices, not ingredient lines), so a bouquet resolves to a
    single priced row and this returns []. Kept as the seam where component rows
    will be produced once recipe composition is modelled.
    """
    return []


@router.post("/orders/{order_id}/items", status_code=201)
async def add_order_item(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Add a line to the order composition (admin-map §2.2.1).

    Body is either {"bouquetId": ...} or {"inventoryItemId": ..., "quantity": n}.
    No price is read from the body — it is taken from the catalog server-side.
    """
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Order is in terminal status '{order.status}' and cannot be changed",
        )

    body = await request.json() or {}
    bouquet_id = body.get("bouquetId")
    inventory_item_id = body.get("inventoryItemId")

    if bouquet_id:
        bouquet = (
            await db.execute(select(Bouquet).where(Bouquet.id == bouquet_id))
        ).scalar_one_or_none()
        if bouquet is None:
            raise HTTPException(status_code=400, detail="Букет не найден")
        parent = OrderItem(
            order_id=order.id,
            parent_id=None,
            kind="bouquet",
            bouquet_id=bouquet.id,
            title=f"Букет - {bouquet.title}",
            unit_price=_dec(bouquet.sale_amount),
            quantity=Decimal(1),
            measure=DEFAULT_MEASURE,
        )
        db.add(parent)
        await db.flush()
        for comp in _bouquet_component_rows(bouquet, parent.id):
            db.add(comp)
    elif inventory_item_id:
        item = (
            await db.execute(select(Item).where(Item.id == inventory_item_id))
        ).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=400, detail="Товар не найден")
        price = _retail_price(item)
        if price is None:
            raise HTTPException(status_code=400, detail="У товара нет розничной цены")
        qty = _dec(body.get("quantity") or 1)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Количество должно быть больше нуля")
        db.add(OrderItem(
            order_id=order.id,
            parent_id=None,
            kind="item",
            inventory_item_id=item.id,
            title=item.title,
            unit_price=price,
            quantity=qty,
            measure=DEFAULT_MEASURE,
        ))
    else:
        raise HTTPException(
            status_code=400, detail="Ожидается bouquetId или inventoryItemId"
        )

    await db.flush()
    await _recalc_total(db, order)
    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)


def _retail_price(item: Item) -> Decimal | None:
    """Retail unit price for a nomenclature item. Posiflora items carry a
    min/max price range; the sale price is the max (falls back to min). Returns
    None when neither is set — the caller then rejects the add with a 400."""
    for candidate in (item.max_price, item.min_price):
        if candidate:
            return _dec(candidate)
    return None


@router.delete("/orders/{order_id}/items/{item_id}", status_code=200)
async def delete_order_item(
    order_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Remove a composition line (a bouquet takes its components with it),
    then recompute the total. Terminal orders are read-only (409)."""
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Order is in terminal status '{order.status}' and cannot be changed",
        )

    target = next((it for it in order.items if it.id == item_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    # Delete components first (a bouquet owns its child rows).
    for child in [it for it in order.items if it.parent_id == target.id]:
        await db.delete(child)
    await db.delete(target)
    await db.flush()
    await _recalc_total(db, order)
    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)


@router.post("/orders/{order_id}/payments", status_code=201)
async def add_order_payment(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Record a manual in-store advance (admin-map §2.2.1, «Добавить аванс»).

    {"method": "cash"|"card"|"sbp"|"transfer", "amount": > 0}. The amount cannot
    exceed the outstanding «К оплате». Stored CONFIRMED with a synthetic
    tbank_order_id so it never touches the T-Bank webhook/checkout flow.
    """
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    body = await request.json() or {}
    method = body.get("method")
    if method not in PAYMENT_METHODS:
        raise HTTPException(
            status_code=400, detail=f"method must be one of {PAYMENT_METHODS}"
        )
    try:
        amount = _dec(body.get("amount"))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    totals = _current_totals(order)
    to_pay = _dec(totals["toPay"])
    if amount > to_pay:
        raise HTTPException(
            status_code=400, detail="Аванс превышает сумму к оплате"
        )

    payment = Payment(
        order_id=order.id,
        tbank_payment_id=None,
        tbank_order_id=f"manual-{uuid.uuid4()}",
        amount=amount,
        status="CONFIRMED",
        method=method,
        kind="advance",
        created_by_id=worker.id,
    )
    db.add(payment)
    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)


# ==========================================================================
# Скидка/надбавка на заказ или строку состава + оплата бонусами
# (admin-map §2.2.1, итоговая панель). Amounts are always computed here from
# the target's own base — the client only sends kind/target/mode/value/reason
# (memory payment-price-vuln).
# ==========================================================================


async def _validate_reason(db: AsyncSession, reason_id: str | None) -> None:
    if reason_id is None:
        return
    exists = (
        await db.execute(select(DiscountReason.id).where(DiscountReason.id == reason_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="Неизвестная причина скидки/надбавки")


@router.put("/orders/{order_id}/discount")
async def set_order_discount(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Скидка/надбавка на весь заказ или на одну строку состава.

    Body: {kind: 'discount'|'markup', target: 'order'|'item', itemId?,
    mode: 'percent'|'amount', value>=0, reasonId?}. `value` is a percent
    (0..100) or a flat ruble amount depending on `mode` — the resulting money
    amount is computed here (base = the item's own unit_price×quantity, or the
    order's itemsTotal) and can never exceed that base. Replaces whatever
    discount/markup was previously set on the same target (not additive).
    """
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Order is in terminal status '{order.status}' and cannot be changed",
        )

    body = await request.json() or {}
    kind = body.get("kind")
    if kind not in DISCOUNT_MARKUP_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {DISCOUNT_MARKUP_KINDS}")
    target = body.get("target")
    if target not in DISCOUNT_MARKUP_TARGETS:
        raise HTTPException(status_code=400, detail=f"target must be one of {DISCOUNT_MARKUP_TARGETS}")
    mode = body.get("mode")
    if mode not in DISCOUNT_MARKUP_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {DISCOUNT_MARKUP_MODES}")

    try:
        value = _dec(body.get("value"))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="value must be a number")
    if value < 0:
        raise HTTPException(status_code=400, detail="value must be >= 0")

    reason_id = body.get("reasonId")
    await _validate_reason(db, reason_id)

    target_item: OrderItem | None = None
    if target == "item":
        item_id = body.get("itemId")
        target_item = next((it for it in order.items if it.id == item_id), None)
        if target_item is None:
            raise HTTPException(status_code=400, detail="itemId должен принадлежать заказу")
        base = _dec(target_item.unit_price) * _dec(target_item.quantity)
    else:
        totals_now = _compute_totals(order, list(order.items), list(order.payments))
        base = _dec(totals_now["itemsTotal"])

    if mode == "percent":
        if value > 100:
            raise HTTPException(status_code=400, detail="value must be between 0 and 100")
        amount = (base * value / Decimal(100)).quantize(Decimal("0.01"))
        percent = value
    else:
        amount = value
        if amount > base:
            raise HTTPException(
                status_code=400, detail="Сумма не может превышать базу для скидки/надбавки"
            )
        percent = None

    if target_item is not None:
        if kind == "discount":
            target_item.discount = amount
            target_item.discount_reason_id = reason_id
            target_item.discount_percent = percent
        else:
            target_item.markup = amount
            target_item.markup_reason_id = reason_id
            target_item.markup_percent = percent
    else:
        if kind == "discount":
            order.discount_total = amount
            order.discount_reason_id = reason_id
            order.discount_percent = percent
        else:
            order.markup_total = amount
            order.markup_reason_id = reason_id
            order.markup_percent = percent

    await db.flush()
    await _recalc_total(db, order)
    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)


@router.delete("/orders/{order_id}/discount")
async def clear_order_discount(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Снять скидку/надбавку — query params target=order|item[&itemId=...]
    &kind=discount|markup."""
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Order is in terminal status '{order.status}' and cannot be changed",
        )

    qs = request.query_params
    kind = qs.get("kind")
    if kind not in DISCOUNT_MARKUP_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {DISCOUNT_MARKUP_KINDS}")
    target = qs.get("target")
    if target not in DISCOUNT_MARKUP_TARGETS:
        raise HTTPException(status_code=400, detail=f"target must be one of {DISCOUNT_MARKUP_TARGETS}")

    target_item: OrderItem | None = None
    if target == "item":
        item_id = qs.get("itemId")
        target_item = next((it for it in order.items if it.id == item_id), None)
        if target_item is None:
            raise HTTPException(status_code=400, detail="itemId должен принадлежать заказу")

    if target_item is not None:
        if kind == "discount":
            target_item.discount = Decimal(0)
            target_item.discount_reason_id = None
            target_item.discount_percent = None
        else:
            target_item.markup = Decimal(0)
            target_item.markup_reason_id = None
            target_item.markup_percent = None
    else:
        if kind == "discount":
            order.discount_total = Decimal(0)
            order.discount_reason_id = None
            order.discount_percent = None
        else:
            order.markup_total = Decimal(0)
            order.markup_reason_id = None
            order.markup_percent = None

    await db.flush()
    await _recalc_total(db, order)
    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)


@router.put("/orders/{order_id}/bonus-payment")
async def set_order_bonus_payment(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """«Оплата бонусами» (admin-map §2.2.1, итоговая панель). {"amount": >= 0}.

    1 бонус == 1 рубль. Replaces any previous bonus payment on this order —
    the old amount is returned to the customer's balance first, so calling
    this twice never double-charges (and a follow-up amount=0 fully reverses
    it). Cannot exceed the customer's own bonus balance or the order's
    «К оплате» (before this bonus is applied).
    """
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_id = getattr(order, "customer_id", None)
    if not customer_id:
        raise HTTPException(status_code=400, detail="У заказа не выбран клиент")
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=400, detail="Клиент не найден")

    body = await request.json() or {}
    try:
        amount = _dec(body.get("amount"))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be >= 0")

    old_amount = _dec(order.bonus_paid)
    # Returning the previous charge to the balance first is what makes a
    # repeat call replace rather than stack (memory: never double-charge).
    available_balance = Decimal(customer.bonus_balance or 0) + old_amount
    if amount > available_balance:
        raise HTTPException(status_code=400, detail="Сумма превышает баланс бонусов клиента")

    totals = _current_totals(order)
    grand_total = _dec(totals["grandTotal"])
    advances = _dec(totals["advances"])
    to_pay_without_bonus = grand_total - advances
    if to_pay_without_bonus < 0:
        to_pay_without_bonus = Decimal(0)
    if amount > to_pay_without_bonus:
        raise HTTPException(status_code=400, detail="Сумма превышает сумму к оплате")

    delta = amount - old_amount
    if delta != 0:
        customer.bonus_balance = int(available_balance - amount)
        db.add(CustomerBonusHistory(
            customer_id=customer.id,
            amount=int(-delta),
            comment=f"Оплата заказа №{order.order_number or order.id}",
            order_id=order.id,
            worker_id=worker.id,
        ))
    order.bonus_paid = amount

    await db.commit()

    fresh = await _load_order_full(db, order.id)
    return await _composition_response(db, fresh)
