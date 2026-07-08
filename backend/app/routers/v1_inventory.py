"""Phase 2 — Posiflora-compatible /v1 inventory reference endpoints.

Covers the warehouse reference entities: nomenclature (inventory-items),
warehouses and vendors. The six warehouse documents (packing/write-off/
markdown/sorting/inventory/movement) are a later slice — they need line-item
includes.
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.inventory_models import Item, Warehouse, Vendor
from app.jsonapi import document
from app.serializers import item_resource, warehouse_resource, vendor_resource

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-inventory"], dependencies=[Depends(get_current_worker)]
)


def _page(qs) -> tuple[int, int]:
    try:
        return int(qs.get("page[number]", 1)), int(qs.get("page[size]", 200))
    except (TypeError, ValueError):
        return 1, 200


async def _list(db, model, serializer, request, where=None):
    number, size = _page(request.query_params)
    base = select(model)
    if where is not None:
        base = base.where(where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.offset((number - 1) * size).limit(size))).scalars().all()
    data = [serializer(r) for r in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/inventory-items")
async def list_items(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    where = None
    category = qs.get("filter[category]")
    if category:
        where = Item.category_id == category
    return await _list(db, Item, item_resource, request, where)


@router.get("/inventory-items/{item_id}")
async def get_item(item_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return document(item_resource(row))


@router.get("/warehouses")
async def list_warehouses(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, Warehouse, warehouse_resource, request)


@router.get("/vendors")
async def list_vendors(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, Vendor, vendor_resource, request)


@router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return document(vendor_resource(row))
