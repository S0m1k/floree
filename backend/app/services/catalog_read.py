"""Storefront read layer served from OUR database (no Posiflora calls).

Reproduces the exact JSON shapes the Next.js storefront already consumes
(previously proxied from the Posiflora API), so the frontend needs no changes:

- recipe categories with derived slugs
- recipe list / detail with imageUrl(s), variants and included tags
- authoritative variant prices for the order flow
"""

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog_models import (
    Category,
    Image,
    Specification,
    SpecificationImage,
    SpecificationWithVariants,
)
from app.dictionary_models import RecipeTag
from app.services.posiflora import RECIPES_GROUP_ID, slugify

# ---------- helpers ----------


def _image_url(img: Image | None) -> str | None:
    if img is None:
        return None
    return img.file_shop or img.file


def _parse_qty(title: str | None) -> int | None:
    if not title:
        return None
    import re

    m = re.search(r"\d+", title)
    return int(m.group()) if m else None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _variant_rows(swvs: list[SpecificationWithVariants]) -> list[dict]:
    """Storefront variant list: active SWVs with their general price."""
    out = []
    for swv in swvs:
        if swv.status != "on":
            continue
        price = None
        for p in swv.prices:
            # General (store-independent) active price; per-store overrides are
            # a POS concern, the storefront sells at the general price.
            if p.status == "on" and p.store_id is None and p.price_value is not None:
                price = p.price_value
                break
        title = swv.variant.title if swv.variant else None
        out.append(
            {
                "swvId": swv.id,
                "title": title,
                "qty": _parse_qty(title),
                "price": price,
                "isDefault": bool(swv.is_default),
            }
        )
    out.sort(key=lambda v: (v["qty"] is None, v["qty"] or 0, v["price"] or 0))
    return out


def _spec_resource(
    spec: Specification,
    gallery: list[str],
    variants: list[dict],
) -> dict:
    logo_url = _image_url(spec.logo) if spec.logo_id else None
    image_urls = gallery or ([logo_url] if logo_url else [])
    return {
        "id": spec.id,
        "type": "specifications",
        "attributes": {
            "title": spec.title,
            "description": spec.description,
            "status": spec.status,
            "public": spec.public,
            "minPrice": spec.min_price,
            "maxPrice": spec.max_price,
            "videoUrl": spec.video_url,
            "createdAt": _iso(spec.created_at),
            "updatedAt": _iso(spec.updated_at),
        },
        "relationships": {
            "category": {
                "data": {"type": "categories", "id": spec.category_id}
                if spec.category_id
                else None
            },
            "logo": {
                "data": {"type": "images", "id": spec.logo_id} if spec.logo_id else None
            },
            "images": {"data": []},
            "tags": {
                "data": [
                    {"type": "tags", "id": t} for t in json.loads(spec.tags_json or "[]")
                ]
            },
        },
        "imageUrl": logo_url or (image_urls[0] if image_urls else None),
        "imageUrls": image_urls,
        "variants": variants,
    }


def _spec_query():
    return (
        select(Specification)
        .where(Specification.status == "on")
        .options(
            selectinload(Specification.logo),
            selectinload(Specification.variants)
            .selectinload(SpecificationWithVariants.variant),
            selectinload(Specification.variants)
            .selectinload(SpecificationWithVariants.prices),
        )
    )


async def _gallery_map(db: AsyncSession, spec_ids: list[str]) -> dict[str, list[str]]:
    """spec_id -> ordered gallery image URLs."""
    if not spec_ids:
        return {}
    rows = (
        await db.execute(
            select(SpecificationImage)
            .where(SpecificationImage.specification_id.in_(spec_ids))
            .options(selectinload(SpecificationImage.image))
            .order_by(SpecificationImage.position)
        )
    ).scalars().all()
    out: dict[str, list[str]] = {}
    for row in rows:
        url = _image_url(row.image)
        if url:
            out.setdefault(row.specification_id, []).append(url)
    return out


# ---------- public API (mirrors services/posiflora signatures) ----------


async def get_recipe_categories(db: AsyncSession) -> dict:
    rows = (
        await db.execute(
            select(Category)
            .where(
                Category.group_id == RECIPES_GROUP_ID,
                Category.deleted.is_(False),
                Category.status == "on",
            )
            .order_by(Category.position, Category.title)
        )
    ).scalars().all()

    result = []
    seen_slugs: dict[str, int] = {}
    for c in rows:
        # Root "Рецепты" placeholder — skip, same rule as the Posiflora path.
        if c.parent_id is None and (c.title or "").strip().lower() == "рецепты":
            continue
        base = c.slug or slugify(c.title or "")
        n = seen_slugs.get(base, 0)
        seen_slugs[base] = n + 1
        slug = base if n == 0 else f"{base}-{n + 1}"
        result.append(
            {
                "id": c.id,
                "type": "categories",
                "attributes": {
                    "title": c.title,
                    "status": c.status,
                    "color": c.color,
                    "path": [c.title],
                    "pathIds": [c.id],
                    "slug": slug,
                },
                "relationships": {
                    "parent": {
                        "data": {"type": "categories", "id": c.parent_id}
                        if c.parent_id
                        else None
                    }
                },
            }
        )
    return {"data": result, "meta": {"total": len(result)}}


async def get_recipes(db: AsyncSession, category_id: str | None = None) -> dict:
    stmt = _spec_query().where(Specification.public.is_(True))
    if category_id:
        stmt = stmt.where(Specification.category_id == category_id)
    specs = (await db.execute(stmt)).scalars().all()

    galleries = await _gallery_map(db, [s.id for s in specs])
    data = [
        _spec_resource(s, galleries.get(s.id, []), _variant_rows(s.variants))
        for s in specs
    ]
    data.sort(key=lambda r: r["attributes"].get("updatedAt") or "", reverse=True)
    return {"data": data, "meta": {"total": len(data)}}


async def get_recipe(db: AsyncSession, recipe_id: str) -> dict | None:
    spec = (
        await db.execute(_spec_query().where(Specification.id == recipe_id))
    ).scalar_one_or_none()
    if spec is None:
        return None

    galleries = await _gallery_map(db, [spec.id])
    resource = _spec_resource(spec, galleries.get(spec.id, []), _variant_rows(spec.variants))

    # included.tags — resolve titles for the storefront tag chips
    tag_ids = json.loads(spec.tags_json or "[]")
    included_tags: dict[str, dict] = {}
    if tag_ids:
        tags = (
            await db.execute(select(RecipeTag).where(RecipeTag.id.in_(tag_ids)))
        ).scalars().all()
        included_tags = {
            t.id: {"id": t.id, "type": "tags", "attributes": {"title": t.title}}
            for t in tags
        }

    return {**resource, "included": {"tags": included_tags}}


async def get_recipe_variant_prices(db: AsyncSession, recipe_id: str) -> dict:
    """Authoritative prices for the order flow: {default_swv_id, prices{swv: rub}}.

    Mirrors services/posiflora.get_recipe_variant_prices so orders.py keeps its
    fail-closed behaviour: unknown/unpriced variants reject the order.
    """
    swvs = (
        await db.execute(
            select(SpecificationWithVariants)
            .where(
                SpecificationWithVariants.specification_id == recipe_id,
                SpecificationWithVariants.status == "on",
            )
            .options(selectinload(SpecificationWithVariants.prices))
        )
    ).scalars().all()

    prices: dict[str, int] = {}
    default_swv_id: str | None = None
    for swv in swvs:
        for p in swv.prices:
            if p.status == "on" and p.store_id is None and p.price_value is not None:
                prices[swv.id] = p.price_value
                break
        if swv.is_default and swv.id in prices:
            default_swv_id = swv.id
    if default_swv_id is None and prices:
        default_swv_id = next(iter(prices))
    return {"default_swv_id": default_swv_id, "prices": prices}
