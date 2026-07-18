"""Phase 2 — Posiflora-compatible /v1 inventory reference endpoints.

Covers the warehouse reference entities: nomenclature (inventory-items),
warehouses and vendors. Vendor writes (admin-map §2.4.4 «Поставщики») live
here too; the six warehouse documents (packing/write-off/markdown/sorting/
inventory/movement) are in v1_warehouse_docs.py — they need line-item
includes and stock-balance side effects. Item writes (admin-map §2.3.4
«Каталог товаров и услуг») are below the vendor section.
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Category, Image, SpecificationComposition
from app.dictionary_models import UnitOfMeasure
from app.inventory_models import (
    Item,
    Warehouse,
    Vendor,
    PackingInvoice,
    PackingInvoiceItem,
    WriteoffInvoiceItem,
    MarkdownActItem,
    SortingActItem,
    InventoryActItem,
    MovementActItem,
    StockBalance,
)
from app.models import OrderItem
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

ITEM_TITLE_MAX = 255
ITEM_TYPES = ("item", "service")
ITEM_STATUSES = ("on", "off")


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
    # Soft-deleted items (see delete_item below) never show up on the catalog
    # list — only a direct GET by id or a PATCH can still reach them.
    where = Item.status != "deleted"
    category = qs.get("filter[category]")
    if category:
        where = where & (Item.category_id == category)
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


# ---------- inventory-item writes (admin-map §2.3.4 «Каталог товаров и услуг») ----------


def _item_str_field(attrs: dict, key: str, max_len: int) -> tuple[bool, str | None]:
    """Same «present vs. sent empty» extraction as `_vendor_field`, reused for
    the item form's optional string attributes (barcode)."""
    if key not in attrs:
        return False, None
    raw = attrs.get(key)
    value = (str(raw).strip() if raw is not None else "") or None
    if value is not None and len(value) > max_len:
        raise HTTPException(status_code=400, detail=f"{key} exceeds {max_len} characters")
    return True, value


async def _validate_item_category(db: AsyncSession, category_id: str | None) -> None:
    if category_id is None:
        return
    exists = (await db.execute(select(Category.id).where(Category.id == category_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="category not found")


async def _validate_item_measure(db: AsyncSession, unit_id: str | None) -> None:
    if unit_id is None:
        return
    exists = (
        await db.execute(select(UnitOfMeasure.id).where(UnitOfMeasure.id == unit_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="measure not found")


async def _validate_item_logo(db: AsyncSession, logo_id: str | None) -> None:
    if logo_id is None:
        return
    exists = (await db.execute(select(Image.id).where(Image.id == logo_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="image not found")


async def _check_barcode_unique(db: AsyncSession, barcode: str | None, *, exclude_id: str | None = None) -> None:
    if barcode is None:
        return
    stmt = select(Item.id).where(Item.barcode == barcode)
    if exclude_id is not None:
        stmt = stmt.where(Item.id != exclude_id)
    dup = (await db.execute(stmt)).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="barcode already in use")


def _validate_prices(min_price, max_price) -> tuple[int, int]:
    """Both must parse as numbers >= 0, and max >= min (admin-map §2.3.4
    «Цены» column shows a min–max range — a max below min can't render)."""
    try:
        lo = int(min_price)
        hi = int(max_price)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="minPrice/maxPrice must be numbers")
    if lo < 0 or hi < 0:
        raise HTTPException(status_code=400, detail="minPrice/maxPrice must be >= 0")
    if hi < lo:
        raise HTTPException(status_code=400, detail="maxPrice must be >= minPrice")
    return lo, hi


def _rel_id(rels: dict, key: str) -> tuple[bool, str | None]:
    """Returns (present, id) for a JSON:API to-one relationship node."""
    if key not in rels:
        return False, None
    node = rels.get(key) or {}
    data = node.get("data") if isinstance(node, dict) else None
    return True, (data.get("id") if isinstance(data, dict) else None)


@router.post("/inventory-items", status_code=201)
async def create_item(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "inventory-items"):
        raise HTTPException(status_code=400, detail="data.type must be 'inventory-items'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > ITEM_TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {ITEM_TITLE_MAX} characters")

    item_type = attrs.get("itemType", "item")
    if item_type not in ITEM_TYPES:
        raise HTTPException(status_code=400, detail=f"itemType must be one of: {', '.join(ITEM_TYPES)}")

    status = attrs.get("status", "on")
    if status not in ITEM_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(ITEM_STATUSES)}")

    min_price, max_price = _validate_prices(attrs.get("priceMin", 0), attrs.get("priceMax", 0))

    _, category_id = _rel_id(rels, "category")
    category_id = category_id or attrs.get("categoryId")
    await _validate_item_category(db, category_id)

    _, unit_id = _rel_id(rels, "measure")
    unit_id = unit_id or attrs.get("measureId")
    await _validate_item_measure(db, unit_id)

    _, logo_id = _rel_id(rels, "logo")
    logo_id = logo_id or attrs.get("logoId")
    await _validate_item_logo(db, logo_id)

    _, barcode = _item_str_field(attrs, "barcode", 64)
    await _check_barcode_unique(db, barcode)

    item = Item(
        title=title,
        item_type=item_type,
        category_id=category_id,
        unit_id=unit_id,
        logo_id=logo_id,
        min_price=min_price,
        max_price=max_price,
        public=bool(attrs.get("public", False)),
        status=status,
        barcode=barcode,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return document(item_resource(item))


@router.patch("/inventory-items/{item_id}")
async def update_item(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    item = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    if "title" in attrs:
        title = (attrs.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        if len(title) > ITEM_TITLE_MAX:
            raise HTTPException(status_code=400, detail=f"title exceeds {ITEM_TITLE_MAX} characters")
        item.title = title

    if "itemType" in attrs:
        item_type = attrs.get("itemType")
        if item_type not in ITEM_TYPES:
            raise HTTPException(status_code=400, detail=f"itemType must be one of: {', '.join(ITEM_TYPES)}")
        item.item_type = item_type

    if "status" in attrs:
        status = attrs.get("status")
        if status not in ITEM_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(ITEM_STATUSES)}")
        item.status = status

    if "public" in attrs:
        item.public = bool(attrs.get("public"))

    if "priceMin" in attrs or "priceMax" in attrs:
        min_price, max_price = _validate_prices(
            attrs.get("priceMin", item.min_price), attrs.get("priceMax", item.max_price)
        )
        item.min_price = min_price
        item.max_price = max_price

    if "barcode" in attrs:
        present, barcode = _item_str_field(attrs, "barcode", 64)
        if present:
            await _check_barcode_unique(db, barcode, exclude_id=item_id)
            item.barcode = barcode

    present, category_id = _rel_id(rels, "category")
    if present:
        await _validate_item_category(db, category_id)
        item.category_id = category_id

    present, unit_id = _rel_id(rels, "measure")
    if present:
        await _validate_item_measure(db, unit_id)
        item.unit_id = unit_id

    present, logo_id = _rel_id(rels, "logo")
    if present:
        await _validate_item_logo(db, logo_id)
        item.logo_id = logo_id

    await db.commit()
    await db.refresh(item)
    return document(item_resource(item))


async def _item_in_use(db: AsyncSession, item_id: str) -> bool:
    """Checks every place an item can be referenced from: the six warehouse
    document line tables, a recipe's flower/goods composition, and an order's
    line items. Any hit blocks deletion (409) — the row stays as history."""
    checks = (
        select(PackingInvoiceItem.id).where(PackingInvoiceItem.item_id == item_id),
        select(WriteoffInvoiceItem.id).where(WriteoffInvoiceItem.item_id == item_id),
        select(MarkdownActItem.id).where(MarkdownActItem.item_id == item_id),
        select(SortingActItem.id).where(
            (SortingActItem.item_from_id == item_id) | (SortingActItem.item_to_id == item_id)
        ),
        select(InventoryActItem.id).where(InventoryActItem.item_id == item_id),
        select(MovementActItem.id).where(MovementActItem.item_id == item_id),
        select(SpecificationComposition.id).where(SpecificationComposition.item_id == item_id),
        select(OrderItem.id).where(OrderItem.inventory_item_id == item_id),
    )
    for stmt in checks:
        hit = (await db.execute(stmt.limit(1))).scalar_one_or_none()
        if hit is not None:
            return True
    return False


@router.delete("/inventory-items/{item_id}", status_code=200)
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """The 347 seeded items are real imported Posiflora production data, so
    unlike vendors (small, low-stakes list — hard delete) this is always a
    soft delete: status flips to 'deleted', the row drops out of the catalog
    list (see list_items), but stays recoverable and keeps any historical
    references (order/document lines, recipe compositions) intact. Deletion
    is still refused outright (409) while the item is *actively* referenced —
    soft-deleting something mid-use would silently orphan those references'
    display data."""
    item = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if await _item_in_use(db, item_id):
        raise HTTPException(
            status_code=409,
            detail="Товар используется в документах, рецептах или заказах — удаление невозможно",
        )

    item.status = "deleted"
    # Zero-quantity stock rows are just bookkeeping, not "usage" — clear them
    # so a later re-import / same-title recreate doesn't inherit a stale
    # tracking row. Nonzero stock is left alone (it isn't reachable through
    # `_item_in_use`, but wiping real stock quantities silently would hide a
    # possible mis-click; the item just stops being orderable/listed).
    await db.execute(
        StockBalance.__table__.delete().where(
            StockBalance.item_id == item_id, StockBalance.quantity == 0
        )
    )
    await db.commit()
    await db.refresh(item)
    return document(item_resource(item))


EAN13_PREFIX = "20"  # 20-29 is the standard "internal use" GS1 prefix range.


def _ean13_check_digit(code12: str) -> str:
    total = 0
    for idx, ch in enumerate(code12):
        digit = int(ch)
        total += digit * (3 if idx % 2 == 1 else 1)
    return str((10 - (total % 10)) % 10)


async def _next_barcode_seq(db: AsyncSession) -> int:
    rows = (
        await db.execute(
            select(Item.barcode).where(Item.barcode.like(f"{EAN13_PREFIX}%"), func.length(Item.barcode) == 13)
        )
    ).scalars().all()
    best = 0
    for barcode in rows:
        middle = barcode[2:12]
        if middle.isdigit():
            best = max(best, int(middle))
    return best + 1


@router.post("/inventory-items/{item_id}/barcode")
async def generate_item_barcode(item_id: str, db: AsyncSession = Depends(get_db)):
    """«Сгенерировать штрих-коды» (admin-map §2.3.4). Idempotent: an item that
    already has a barcode just gets it echoed back unchanged."""
    item = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.barcode:
        return document(item_resource(item))

    seq = await _next_barcode_seq(db)
    code12 = f"{EAN13_PREFIX}{seq:010d}"
    barcode = code12 + _ean13_check_digit(code12)

    # Extremely unlikely (10-digit sequence space), but guard against a
    # collision anyway rather than ever emitting a duplicate barcode.
    while (await db.execute(select(Item.id).where(Item.barcode == barcode))).scalar_one_or_none() is not None:
        seq += 1
        code12 = f"{EAN13_PREFIX}{seq:010d}"
        barcode = code12 + _ean13_check_digit(code12)

    item.barcode = barcode
    await db.commit()
    await db.refresh(item)
    return document(item_resource(item))
