"""Phase 2 — Posiflora-compatible /v1 endpoints for stores, customers, bouquets."""

import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import Store, Customer, Bouquet
from app.models import (
    Order,
    Payment,
    OrderStatusHistory,
    ORDER_STATUSES,
    TERMINAL_STATUSES,
    DELIVERY_TYPES,
)
from app.staff_models import Worker
from app.jsonapi import document
from app.serializers import (
    store_resource,
    customer_resource,
    bouquet_resource,
    order_resource,
    order_payment_resource,
    order_status_history_resource,
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


@router.get("/customers")
async def list_customers(request: Request, db: AsyncSession = Depends(get_db)):
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

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(base.order_by(Customer.created_at.desc()).offset((number - 1) * size).limit(size))
    ).scalars().all()

    stats_by_id = await _customer_order_stats(db, list(rows))
    data = [customer_resource(r, stats_by_id.get(r.id)) for r in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    stats = await _customer_order_stats(db, [row])
    return document(customer_resource(row, stats.get(row.id)))


@router.get("/bouquets")
async def list_bouquets(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    where = None
    store = qs.get("filter[store]")
    if store:
        where = Bouquet.store_id == store
    return await _list(db, Bouquet, bouquet_resource, request, where)


@router.get("/bouquets/{bouquet_id}")
async def get_bouquet(bouquet_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Bouquet).where(Bouquet.id == bouquet_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Bouquet not found")
    return document(bouquet_resource(row))


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


@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _page(qs)

    # filter[customer] needs a DB lookup (phone match), so it's resolved once
    # here and appended to every clause set below.
    customer_clauses = await _order_customer_clauses(db, qs)

    base = select(Order)
    for clause in (*_order_filters(qs, include_status=True), *customer_clauses):
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

    # Status-tab counts + sum aggregates honor every filter except `status`
    # itself, so switching tabs doesn't reset the rest of the filter panel.
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

    agg_stmt = select(
        func.coalesce(func.sum(Order.total_amount), 0),
    ).select_from(Order)
    for clause in (*_order_filters(qs, include_status=True), *customer_clauses):
        agg_stmt = agg_stmt.where(clause)
    sum_total = (await db.execute(agg_stmt)).scalar_one()

    paid_stmt = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .select_from(Order)
        .join(Payment, Payment.order_id == Order.id)
        .where(Payment.status.in_(("CONFIRMED", "paid")))
    )
    for clause in (*_order_filters(qs, include_status=True), *customer_clauses):
        paid_stmt = paid_stmt.where(clause)
    sum_paid = (await db.execute(paid_stmt)).scalar_one()

    return document(data, meta={
        "page": {"number": number, "size": size},
        "total": total,
        "statusCounts": status_counts,
        "aggregates": {"totalAmount": sum_total, "paymentsAmount": sum_paid},
    })


@router.get("/orders/{order_id}")
async def get_order_v1(order_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.payments))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return document(order_resource(order))


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


async def _next_order_number(db: AsyncSession) -> int:
    current = (await db.execute(select(func.max(Order.order_number)))).scalar_one()
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
    return document(order_resource(fresh))


@router.patch("/orders/{order_id}")
async def update_order_status_v1(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Change an order's CRM/fulfillment status (admin-map §2.2.1).

    Posiflora allows free transitions between active statuses, but terminal ones
    (completed/cancelled/return) are read-only — attempting to move out of them
    is a 409. Every change appends a history entry; terminal moves stamp
    closed_at / closed_by.
    """
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    new_status = attrs.get("status")
    if new_status not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {ORDER_STATUSES}"
        )

    order = await _load_order(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

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
    await db.commit()

    fresh = await _load_order(db, order.id)
    return document(order_resource(fresh))


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
        await db.execute(base.offset((number - 1) * size).limit(size))
    ).scalars().all()
    data = [order_payment_resource(p) for p in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})
