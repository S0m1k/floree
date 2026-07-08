"""Phase 2 — Posiflora-compatible /v1 endpoints for stores, customers, bouquets."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import Store, Customer, Bouquet
from app.models import Order, Payment, OrderStatusHistory, ORDER_STATUSES
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


async def _customer_order_stats(db: AsyncSession, phones: list[str]) -> dict[str, dict]:
    """Orders carry no customer_id FK — match by phone (the only field a
    checkout order and a Customer row share) and aggregate per phone.
    """
    if not phones:
        return {}
    stmt = (
        select(Order.phone, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
        .where(Order.phone.in_(phones))
        .group_by(Order.phone)
    )
    rows = (await db.execute(stmt)).all()
    return {
        phone: {
            "ordersQty": count,
            "ordersAmount": float(total),
            "avgCheck": round(float(total) / count, 2) if count else 0,
        }
        for phone, count, total in rows
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

    stats_by_phone = await _customer_order_stats(db, [r.phone for r in rows])
    data = [customer_resource(r, stats_by_phone.get(r.phone)) for r in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    stats = await _customer_order_stats(db, [row.phone])
    return document(customer_resource(row, stats.get(row.phone)))


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


@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _page(qs)

    base = select(Order)
    for clause in _order_filters(qs, include_status=True):
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
    no_status_clauses = _order_filters(qs, include_status=False)

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
    for clause in _order_filters(qs, include_status=True):
        agg_stmt = agg_stmt.where(clause)
    sum_total = (await db.execute(agg_stmt)).scalar_one()

    paid_stmt = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .select_from(Order)
        .join(Payment, Payment.order_id == Order.id)
        .where(Payment.status.in_(("CONFIRMED", "paid")))
    )
    for clause in _order_filters(qs, include_status=True):
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
