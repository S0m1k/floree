"""Phase 2 — Posiflora-compatible /v1 catalog endpoints served from our DB.

Mirrors the vendor's JSON:API so the storefront can switch its base URL to us
without changing response handling. Bracketed query params (filter[...],
page[...]) are parsed straight off the query string.

The recipe card (admin-map.md §2.3.2, /admin/specifications/{id}) write
endpoints live here too, next to the read endpoints they extend: create/update
a specification, manage its quantity variants (+ duplicate), the flower/goods
composition of a variant, its per-store sale prices, and the photo gallery
(URL-based — no file-upload pipeline yet).
"""

import json
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import (
    Specification,
    Category,
    Image,
    SpecificationImage,
    SpecificationVariant,
    SpecificationWithVariants,
    SpecificationVariantPrice,
    SpecificationComposition,
    Store,
)
from app.inventory_models import Item
from app.staff_models import Worker
from app.dictionary_models import RecipeTag
from app.jsonapi import document, Included
from app.serializers import (
    specification_resource,
    category_resource,
    build_category_path,
)

from app.deps import get_current_worker

TITLE_MAX = 100
router = APIRouter(
    prefix="/v1", tags=["v1-catalog"], dependencies=[Depends(get_current_worker)]
)

# Eager-load the full recipe→variant→price→composition chain for the detail
# endpoint. The list endpoint only needs the gallery, not the variant chain.
_SPEC_GALLERY = (selectinload(Specification.logo), selectinload(Specification.gallery).selectinload(SpecificationImage.image))
_SPEC_INCLUDES = (
    *_SPEC_GALLERY,
    selectinload(Specification.variants).selectinload(SpecificationWithVariants.prices),
    selectinload(Specification.variants).selectinload(SpecificationWithVariants.variant),
    selectinload(Specification.variants).selectinload(SpecificationWithVariants.compositions),
)


def _int(qs, key: str, default: int) -> int:
    try:
        return int(qs.get(key, default))
    except (TypeError, ValueError):
        return default


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


def _rel_ids(rels: dict, key: str) -> list[str]:
    data = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    if not isinstance(data, list):
        return []
    return [n["id"] for n in data if isinstance(n, dict) and n.get("id")]


async def _items_by_id_for_spec(db: AsyncSession, spec: Specification) -> dict[str, Item]:
    item_ids = {
        comp.item_id
        for swv in spec.variants
        for comp in swv.compositions
    }
    if not item_ids:
        return {}
    rows = (await db.execute(select(Item).where(Item.id.in_(item_ids)))).scalars().all()
    return {i.id: i for i in rows}


async def _load_spec_detail(db: AsyncSession, spec_id: str) -> Specification | None:
    stmt = (
        select(Specification)
        .where(Specification.id == spec_id)
        .options(*_SPEC_INCLUDES)
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _spec_detail_response(db: AsyncSession, spec: Specification) -> dict:
    items_by_id = await _items_by_id_for_spec(db, spec)
    inc = Included()
    data = specification_resource(spec, inc, with_variants=True, items_by_id=items_by_id)
    return document(data, included=inc.as_list())


@router.get("/categories")
async def list_categories(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    group = qs.get("filter[group]")
    size = _int(qs, "page[size]", 200)

    stmt = select(Category).where(Category.deleted.is_(False))
    if group is not None:
        stmt = stmt.where(Category.group_id == group)
    rows = (await db.execute(stmt.limit(size))).scalars().all()

    # Build a lookup for path resolution (include parents even if filtered out).
    by_id = {c.id: c for c in (await db.execute(select(Category))).scalars().all()}

    data = []
    for c in rows:
        titles, ids = build_category_path(c, by_id)
        data.append(category_resource(c, titles, ids))
    return document(data, meta={"total": len(data)})


@router.get("/specifications")
async def list_specifications(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    status = qs.get("filter[status]")
    category = qs.get("filter[category]")
    public = qs.get("filter[public]")
    q = qs.get("q")
    number = _int(qs, "page[number]", 1)
    size = _int(qs, "page[size]", 200)

    base = select(Specification)
    if status is not None:
        base = base.where(Specification.status == status)
    if category is not None:
        base = base.where(Specification.category_id == category)
    if public is not None:
        base = base.where(Specification.public.is_(public == "true"))
    if q:
        base = base.where(or_(
            Specification.title.ilike(f"%{q}%"),
            Specification.description.ilike(f"%{q}%"),
        ))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    stmt = (
        base.options(*_SPEC_GALLERY)
        .order_by(Specification.updated_at.desc())
        .offset((number - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Variant counts aren't loaded with the list query (selectinload of the full
    # variant chain is reserved for the detail endpoint) — a single grouped
    # count query is cheap and lets admin cards show "N вариантов" per spec.
    spec_ids = [s.id for s in rows]
    variant_counts: dict[str, int] = {}
    if spec_ids:
        count_stmt = (
            select(SpecificationWithVariants.specification_id, func.count())
            .where(
                SpecificationWithVariants.specification_id.in_(spec_ids),
                SpecificationWithVariants.status == "on",
            )
            .group_by(SpecificationWithVariants.specification_id)
        )
        variant_counts = dict((await db.execute(count_stmt)).all())

    inc = Included()
    data = []
    for s in rows:
        res = specification_resource(s, inc, with_variants=False)
        # Not a Posiflora field — our own extension for the admin card grid.
        res["attributes"]["variantsCount"] = variant_counts.get(s.id, 0)
        data.append(res)
    return document(
        data,
        included=inc.as_list(),
        meta={"page": {"number": number, "size": size}, "total": total},
    )


@router.get("/specifications/{spec_id}")
async def get_specification(spec_id: str, db: AsyncSession = Depends(get_db)):
    spec = await _load_spec_detail(db, spec_id)
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")
    return await _spec_detail_response(db, spec)


# ==========================================================================
# Recipe card writes (admin-map.md §2.3.2)
# ==========================================================================


def _extract_title(attrs: dict, *, required: bool) -> str | None:
    if "title" not in attrs:
        if required:
            raise HTTPException(status_code=400, detail="title is required")
        return None
    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {TITLE_MAX} characters")
    return title


async def _validate_category(db: AsyncSession, category_id: str | None) -> None:
    if category_id is None:
        return
    exists = (
        await db.execute(select(Category.id).where(Category.id == category_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="category not found")


async def _validate_author(db: AsyncSession, author_id: str | None) -> None:
    if author_id is None:
        return
    exists = (
        await db.execute(select(Worker.id).where(Worker.id == author_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="author not found")


def _clean_tag_ids(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(t) for t in raw if t]


async def _validate_tags(db: AsyncSession, tag_ids: list[str]) -> None:
    if not tag_ids:
        return
    found = (await db.execute(select(RecipeTag.id).where(RecipeTag.id.in_(tag_ids)))).scalars().all()
    missing = set(tag_ids) - set(found)
    if missing:
        raise HTTPException(status_code=400, detail=f"recipe tag(s) not found: {', '.join(sorted(missing))}")


async def _recalc_price_range(db: AsyncSession, spec_id: str) -> None:
    """Refresh Specification.min_price/max_price (admin card grid price range)
    from every active variant's effective price — its per-store overrides
    when set, else its composition total. Runs after any write that can move
    a variant's price (composition edits, store-price edits, variant
    create/duplicate/delete)."""
    stmt = (
        select(SpecificationWithVariants)
        .where(
            SpecificationWithVariants.specification_id == spec_id,
            SpecificationWithVariants.status == "on",
        )
        .options(
            selectinload(SpecificationWithVariants.prices),
            selectinload(SpecificationWithVariants.compositions),
        )
    )
    swvs = (await db.execute(stmt)).scalars().all()

    item_ids = {comp.item_id for swv in swvs for comp in swv.compositions}
    items_by_id: dict[str, Item] = {}
    if item_ids:
        rows = (await db.execute(select(Item).where(Item.id.in_(item_ids)))).scalars().all()
        items_by_id = {i.id: i for i in rows}

    effective_prices: list[float] = []
    for swv in swvs:
        composition_total = sum(
            (float(c.quantity or 0) * float(items_by_id[c.item_id].max_price)
             for c in swv.compositions if c.item_id in items_by_id),
            0.0,
        )
        store_prices = [p for p in swv.prices if p.store_id is not None]
        if store_prices:
            for p in store_prices:
                effective_prices.append(p.price_value if p.price_value is not None else composition_total)
        elif swv.prices:
            for p in swv.prices:
                if p.price_value is not None:
                    effective_prices.append(p.price_value)
        elif composition_total:
            effective_prices.append(composition_total)

    spec = (await db.execute(select(Specification).where(Specification.id == spec_id))).scalar_one()
    spec.min_price = int(round(min(effective_prices))) if effective_prices else 0
    spec.max_price = int(round(max(effective_prices))) if effective_prices else 0


@router.post("/specifications", status_code=201)
async def create_specification(request: Request, db: AsyncSession = Depends(get_db)):
    """Create a recipe (admin «Новый рецепт»). Title is the only hard
    requirement; a first quantity variant («Вариант 1» unless overridden) is
    always created alongside it so the card immediately has something to
    price."""
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "specifications"):
        raise HTTPException(status_code=400, detail="data.type must be 'specifications'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    title = _extract_title(attrs, required=True)

    category_id = _rel_id(rels, "category") or attrs.get("categoryId")
    await _validate_category(db, category_id)

    author_id = _rel_id(rels, "author") or attrs.get("authorId")
    await _validate_author(db, author_id)

    tag_ids = _rel_ids(rels, "recipeTags") or _clean_tag_ids(attrs.get("tags"))
    await _validate_tags(db, tag_ids)

    video_url = attrs.get("videoUrl")
    description = attrs.get("description")

    spec = Specification(
        title=title,
        description=description,
        category_id=category_id,
        author_id=author_id,
        video_url=video_url or None,
        tags_json=json.dumps(tag_ids) if tag_ids else None,
        status="on",
        public=False,
    )
    db.add(spec)
    await db.flush()

    variant_title = (attrs.get("variantTitle") or "Вариант 1").strip() or "Вариант 1"
    variant = SpecificationVariant(title=variant_title)
    db.add(variant)
    await db.flush()
    swv = SpecificationWithVariants(
        specification_id=spec.id, variant_id=variant.id, is_default=True, status="on",
    )
    db.add(swv)

    await db.commit()

    fresh = await _load_spec_detail(db, spec.id)
    return await _spec_detail_response(db, fresh)


@router.patch("/specifications/{spec_id}")
async def update_specification(spec_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Edit the recipe card's left-column fields, the «Скрыть/показать в
    интернет магазине» toggle (public), and «Перенести в архив» (status)."""
    spec = (
        await db.execute(select(Specification).where(Specification.id == spec_id))
    ).scalar_one_or_none()
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    if "title" in attrs:
        spec.title = _extract_title(attrs, required=True)
    if "description" in attrs:
        spec.description = attrs.get("description") or None
    if "videoUrl" in attrs:
        spec.video_url = attrs.get("videoUrl") or None
    if "public" in attrs:
        spec.public = bool(attrs.get("public"))
    if "status" in attrs:
        status = attrs.get("status")
        if status not in ("on", "off", "deleted"):
            raise HTTPException(status_code=400, detail="status must be one of on/off/deleted")
        spec.status = status
    if "tags" in attrs or "recipeTags" in rels:
        tag_ids = _rel_ids(rels, "recipeTags") or _clean_tag_ids(attrs.get("tags"))
        await _validate_tags(db, tag_ids)
        spec.tags_json = json.dumps(tag_ids) if tag_ids else None

    if "category" in rels:
        category_id = _rel_id(rels, "category")
        await _validate_category(db, category_id)
        spec.category_id = category_id
    if "author" in rels:
        author_id = _rel_id(rels, "author")
        await _validate_author(db, author_id)
        spec.author_id = author_id
    if "logo" in rels:
        logo_id = _rel_id(rels, "logo")
        if logo_id is not None:
            exists = (await db.execute(select(Image.id).where(Image.id == logo_id))).scalar_one_or_none()
            if exists is None:
                raise HTTPException(status_code=400, detail="image not found")
        spec.logo_id = logo_id

    await db.commit()

    fresh = await _load_spec_detail(db, spec.id)
    return await _spec_detail_response(db, fresh)


# ---------- gallery (URL-based; no file-upload pipeline yet) ----------


@router.post("/specifications/{spec_id}/images", status_code=201)
async def add_specification_image(spec_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    spec = (
        await db.execute(select(Specification).where(Specification.id == spec_id))
    ).scalar_one_or_none()
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")

    body = await request.json() or {}
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    image = Image(file=url, file_shop=url, file_medium=url, file_small=url)
    db.add(image)
    await db.flush()

    position_count = (
        await db.execute(
            select(func.count()).select_from(SpecificationImage).where(
                SpecificationImage.specification_id == spec_id
            )
        )
    ).scalar_one()
    db.add(SpecificationImage(specification_id=spec_id, image_id=image.id, position=position_count))
    if spec.logo_id is None:
        spec.logo_id = image.id

    await db.commit()

    fresh = await _load_spec_detail(db, spec.id)
    return await _spec_detail_response(db, fresh)


@router.delete("/specifications/{spec_id}/images/{image_id}", status_code=200)
async def remove_specification_image(spec_id: str, image_id: str, db: AsyncSession = Depends(get_db)):
    spec = (
        await db.execute(select(Specification).where(Specification.id == spec_id))
    ).scalar_one_or_none()
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")

    row = (
        await db.execute(
            select(SpecificationImage).where(
                SpecificationImage.specification_id == spec_id,
                SpecificationImage.image_id == image_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Image not in gallery")
    await db.delete(row)
    if spec.logo_id == image_id:
        remaining = (
            await db.execute(
                select(SpecificationImage)
                .where(SpecificationImage.specification_id == spec_id, SpecificationImage.image_id != image_id)
                .order_by(SpecificationImage.position)
                .limit(1)
            )
        ).scalar_one_or_none()
        spec.logo_id = remaining.image_id if remaining else None

    await db.commit()

    fresh = await _load_spec_detail(db, spec.id)
    return await _spec_detail_response(db, fresh)


# ---------- variants ----------


async def _load_swv(db: AsyncSession, swv_id: str) -> SpecificationWithVariants | None:
    stmt = (
        select(SpecificationWithVariants)
        .where(SpecificationWithVariants.id == swv_id)
        .options(
            selectinload(SpecificationWithVariants.prices),
            selectinload(SpecificationWithVariants.compositions),
            selectinload(SpecificationWithVariants.variant),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("/specifications/{spec_id}/variants", status_code=201)
async def create_specification_variant(spec_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Add a quantity variant («+ Добавить вариант»), or duplicate an existing
    one (`copyFrom`) — copies its composition and per-store prices."""
    spec = (
        await db.execute(select(Specification).where(Specification.id == spec_id))
    ).scalar_one_or_none()
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")

    body = await request.json() or {}
    title = (body.get("title") or "").strip()
    copy_from = body.get("copyFrom")

    source: SpecificationWithVariants | None = None
    if copy_from:
        source = await _load_swv(db, copy_from)
        if source is None or source.specification_id != spec_id:
            raise HTTPException(status_code=400, detail="copyFrom variant not found")
        if not title:
            title = f"{source.variant.title} (копия)" if source.variant else "Вариант (копия)"

    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {TITLE_MAX} characters")

    variant = SpecificationVariant(title=title)
    db.add(variant)
    await db.flush()
    swv = SpecificationWithVariants(
        specification_id=spec_id, variant_id=variant.id, is_default=False, status="on",
    )
    db.add(swv)
    await db.flush()

    if source is not None:
        for comp in source.compositions:
            db.add(SpecificationComposition(
                spec_with_variants_id=swv.id, item_id=comp.item_id,
                quantity=comp.quantity, position=comp.position,
            ))
        for p in source.prices:
            db.add(SpecificationVariantPrice(
                spec_with_variants_id=swv.id, price_value=p.price_value,
                status=p.status, store_id=p.store_id,
            ))

    await db.flush()
    await _recalc_price_range(db, spec_id)
    await db.commit()

    fresh = await _load_spec_detail(db, spec_id)
    return await _spec_detail_response(db, fresh)


@router.patch("/specification-variants/{swv_id}")
async def update_specification_variant(swv_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    swv = await _load_swv(db, swv_id)
    if swv is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    body = await request.json() or {}
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or (body if "title" in body else {})

    if "title" in attrs:
        title = (attrs.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        if len(title) > TITLE_MAX:
            raise HTTPException(status_code=400, detail=f"title exceeds {TITLE_MAX} characters")
        if swv.variant is not None:
            swv.variant.title = title
        else:
            variant = SpecificationVariant(title=title)
            db.add(variant)
            await db.flush()
            swv.variant_id = variant.id

    await db.commit()

    fresh = await _load_spec_detail(db, swv.specification_id)
    return await _spec_detail_response(db, fresh)


@router.delete("/specification-variants/{swv_id}", status_code=200)
async def delete_specification_variant(swv_id: str, db: AsyncSession = Depends(get_db)):
    swv = (
        await db.execute(select(SpecificationWithVariants).where(SpecificationWithVariants.id == swv_id))
    ).scalar_one_or_none()
    if swv is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    spec_id = swv.specification_id
    remaining = (
        await db.execute(
            select(func.count()).select_from(SpecificationWithVariants).where(
                SpecificationWithVariants.specification_id == spec_id
            )
        )
    ).scalar_one()
    if remaining <= 1:
        raise HTTPException(status_code=400, detail="Нельзя удалить последний вариант рецепта")

    for comp in (
        await db.execute(
            select(SpecificationComposition).where(SpecificationComposition.spec_with_variants_id == swv_id)
        )
    ).scalars().all():
        await db.delete(comp)
    for p in (
        await db.execute(
            select(SpecificationVariantPrice).where(SpecificationVariantPrice.spec_with_variants_id == swv_id)
        )
    ).scalars().all():
        await db.delete(p)
    await db.delete(swv)
    await db.flush()
    await _recalc_price_range(db, spec_id)
    await db.commit()

    fresh = await _load_spec_detail(db, spec_id)
    return await _spec_detail_response(db, fresh)


# ---------- composition («Состав варианта рецепта» modal) ----------


def _dec(value) -> Decimal:
    if value is None:
        return Decimal(0)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="quantity must be a number")


@router.put("/specification-variants/{swv_id}/composition")
async def replace_specification_composition(swv_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Full replace of a variant's composition — the modal always sends the
    complete desired row set. Each row needs an existing item and a positive
    quantity; the response echoes the fresh composition + its total."""
    swv = await _load_swv(db, swv_id)
    if swv is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    body = await request.json() or {}
    rows = body.get("data") if isinstance(body.get("data"), list) else body.get("items")
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="Expected a list of composition rows")

    parsed: list[tuple[str, Decimal]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise HTTPException(status_code=400, detail="Each row must be an object")
        item_id = row.get("itemId")
        if not item_id:
            raise HTTPException(status_code=400, detail="itemId is required")
        qty = _dec(row.get("quantity"))
        if qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be greater than 0")
        parsed.append((item_id, qty))

    item_ids = {item_id for item_id, _ in parsed}
    items_by_id: dict[str, Item] = {}
    if item_ids:
        found = (await db.execute(select(Item).where(Item.id.in_(item_ids)))).scalars().all()
        items_by_id = {i.id: i for i in found}
        missing = item_ids - set(items_by_id)
        if missing:
            raise HTTPException(status_code=400, detail=f"item(s) not found: {', '.join(sorted(missing))}")

    for comp in list(swv.compositions):
        await db.delete(comp)
    await db.flush()

    for position, (item_id, qty) in enumerate(parsed):
        db.add(SpecificationComposition(
            spec_with_variants_id=swv_id, item_id=item_id, quantity=qty, position=position,
        ))
    await db.flush()
    await _recalc_price_range(db, swv.specification_id)
    await db.commit()

    fresh = await _load_spec_detail(db, swv.specification_id)
    return await _spec_detail_response(db, fresh)


# ---------- per-store prices («Активность на точках») ----------


@router.put("/specification-variants/{swv_id}/store-prices")
async def replace_specification_store_prices(swv_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Full replace of the variant's per-store price rows. `priceValue: null`
    marks a store as «по цене состава»; a store missing from the list is
    removed from «Активность на точках» (the corzinka delete)."""
    swv = await _load_swv(db, swv_id)
    if swv is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    body = await request.json() or {}
    rows = body.get("data") if isinstance(body.get("data"), list) else body.get("stores")
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="Expected a list of store-price rows")

    parsed: list[tuple[str, int | None]] = []
    seen_stores: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise HTTPException(status_code=400, detail="Each row must be an object")
        store_id = row.get("storeId")
        if not store_id:
            raise HTTPException(status_code=400, detail="storeId is required")
        if store_id in seen_stores:
            raise HTTPException(status_code=400, detail=f"duplicate storeId: {store_id}")
        seen_stores.add(store_id)
        raw_price = row.get("priceValue")
        price: int | None = None
        if raw_price is not None:
            try:
                price = int(raw_price)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="priceValue must be a number or null")
            if price < 0:
                raise HTTPException(status_code=400, detail="priceValue must be >= 0")
        parsed.append((store_id, price))

    if seen_stores:
        found = (
            await db.execute(select(Store.id).where(Store.id.in_(seen_stores)))
        ).scalars().all()
        missing = seen_stores - set(found)
        if missing:
            raise HTTPException(status_code=400, detail=f"store(s) not found: {', '.join(sorted(missing))}")

    for p in list(swv.prices):
        if p.store_id is not None:
            await db.delete(p)
    await db.flush()

    for store_id, price in parsed:
        db.add(SpecificationVariantPrice(
            spec_with_variants_id=swv_id, store_id=store_id, price_value=price, status="on",
        ))
    await db.flush()
    await _recalc_price_range(db, swv.specification_id)
    await db.commit()

    fresh = await _load_spec_detail(db, swv.specification_id)
    return await _spec_detail_response(db, fresh)
