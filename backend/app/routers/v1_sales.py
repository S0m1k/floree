"""Phase 2 — Posiflora-compatible /v1 endpoints for stores, customers, bouquets."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import Store, Customer, Bouquet
from app.models import Order, Payment
from app.jsonapi import document
from app.serializers import (
    store_resource,
    customer_resource,
    bouquet_resource,
    order_resource,
    order_payment_resource,
)

router = APIRouter(prefix="/v1", tags=["v1-sales"])


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


@router.get("/customers")
async def list_customers(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    where = None
    phone = qs.get("filter[phone]")
    if phone:
        where = Customer.phone == phone
    return await _list(db, Customer, customer_resource, request, where)


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return document(customer_resource(row))


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


@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _page(qs)
    base = select(Order)
    status = qs.get("filter[status]")
    if status:
        base = base.where(Order.status == status)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = (
        base.options(selectinload(Order.payments))
        .order_by(Order.created_at.desc())
        .offset((number - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    data = [order_resource(o) for o in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/orders/{order_id}")
async def get_order_v1(order_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.payments))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return document(order_resource(order))


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
