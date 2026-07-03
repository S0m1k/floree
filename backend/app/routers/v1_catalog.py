"""Phase 2 — Posiflora-compatible /v1 catalog endpoints served from our DB.

Mirrors the vendor's JSON:API so the storefront can switch its base URL to us
without changing response handling. Bracketed query params (filter[...],
page[...]) are parsed straight off the query string.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.catalog_models import Specification, Category, SpecificationWithVariants
from app.jsonapi import document, Included
from app.serializers import (
    specification_resource,
    category_resource,
    build_category_path,
)

router = APIRouter(prefix="/v1", tags=["v1-catalog"])

# Eager-load the full recipe→variant→price chain for the detail endpoint.
_SPEC_INCLUDES = (
    selectinload(Specification.logo),
    selectinload(Specification.variants).selectinload(SpecificationWithVariants.prices),
    selectinload(Specification.variants).selectinload(SpecificationWithVariants.variant),
)


def _int(qs, key: str, default: int) -> int:
    try:
        return int(qs.get(key, default))
    except (TypeError, ValueError):
        return default


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
    number = _int(qs, "page[number]", 1)
    size = _int(qs, "page[size]", 200)

    base = select(Specification)
    if status is not None:
        base = base.where(Specification.status == status)
    if category is not None:
        base = base.where(Specification.category_id == category)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    stmt = (
        base.options(selectinload(Specification.logo))
        .order_by(Specification.updated_at.desc())
        .offset((number - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).scalars().all()

    inc = Included()
    data = [specification_resource(s, inc, with_variants=False) for s in rows]
    return document(
        data,
        included=inc.as_list(),
        meta={"page": {"number": number, "size": size}, "total": total},
    )


@router.get("/specifications/{spec_id}")
async def get_specification(spec_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Specification).where(Specification.id == spec_id).options(*_SPEC_INCLUDES)
    spec = (await db.execute(stmt)).scalar_one_or_none()
    if spec is None:
        raise HTTPException(status_code=404, detail="Specification not found")

    inc = Included()
    data = specification_resource(spec, inc, with_variants=True)
    return document(data, included=inc.as_list())
