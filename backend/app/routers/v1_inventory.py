"""Phase 2 — Posiflora-compatible /v1 inventory reference endpoints.

Covers the warehouse reference entities: nomenclature (inventory-items),
warehouses and vendors. Vendor writes (admin-map §2.4.4 «Поставщики») live
here too; the six warehouse documents (packing/write-off/markdown/sorting/
inventory/movement) are in v1_warehouse_docs.py — they need line-item
includes and stock-balance side effects.
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.inventory_models import Item, Warehouse, Vendor, PackingInvoice
from app.jsonapi import document
from app.serializers import item_resource, warehouse_resource, vendor_resource

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-inventory"], dependencies=[Depends(get_current_worker)]
)

VENDOR_TITLE_MAX = 255
VENDOR_PHONE_MAX = 32
VENDOR_EMAIL_MAX = 255
VENDOR_COMMENT_MAX = 2000


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


# ---------- vendor writes (admin-map §2.4.4) ----------


def _vendor_field(attrs: dict, key: str, max_len: int) -> tuple[bool, str | None]:
    """Extract an optional string attribute, trimmed and length-checked.
    Returns (present, value) — `present` distinguishes "not sent" from
    "sent as empty/null" for PATCH's partial-update semantics."""
    if key not in attrs:
        return False, None
    raw = attrs.get(key)
    value = (str(raw).strip() if raw is not None else "") or None
    if value is not None and len(value) > max_len:
        raise HTTPException(status_code=400, detail=f"{key} exceeds {max_len} characters")
    return True, value


@router.post("/vendors", status_code=201)
async def create_vendor(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "vendors"):
        raise HTTPException(status_code=400, detail="data.type must be 'vendors'")
    attrs = data.get("attributes") or {}

    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > VENDOR_TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {VENDOR_TITLE_MAX} characters")

    _, phone = _vendor_field(attrs, "phone", VENDOR_PHONE_MAX)
    _, email = _vendor_field(attrs, "email", VENDOR_EMAIL_MAX)
    # `description` mirrors vendor_resource's attribute name for `comment`.
    comment_key = "description" if "description" in attrs else "comment"
    _, comment = _vendor_field(attrs, comment_key, VENDOR_COMMENT_MAX)

    vendor = Vendor(title=title, phone=phone, email=email, comment=comment, is_system=False)
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return document(vendor_resource(vendor))


@router.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}

    if "title" in attrs:
        title = (attrs.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        if len(title) > VENDOR_TITLE_MAX:
            raise HTTPException(status_code=400, detail=f"title exceeds {VENDOR_TITLE_MAX} characters")
        vendor.title = title

    present, phone = _vendor_field(attrs, "phone", VENDOR_PHONE_MAX)
    if present:
        vendor.phone = phone
    present, email = _vendor_field(attrs, "email", VENDOR_EMAIL_MAX)
    if present:
        vendor.email = email
    comment_key = "description" if "description" in attrs else "comment"
    present, comment = _vendor_field(attrs, comment_key, VENDOR_COMMENT_MAX)
    if present:
        vendor.comment = comment

    await db.commit()
    await db.refresh(vendor)
    return document(vendor_resource(vendor))


@router.delete("/vendors/{vendor_id}", status_code=204)
async def delete_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if vendor.is_system:
        raise HTTPException(status_code=400, detail="Системного поставщика нельзя удалить")

    has_docs = (
        await db.execute(
            select(PackingInvoice.id).where(PackingInvoice.vendor_id == vendor_id).limit(1)
        )
    ).scalar_one_or_none()
    if has_docs is not None:
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить поставщика: с ним связаны приходные накладные",
        )

    await db.delete(vendor)
    await db.commit()
    return Response(status_code=204)
