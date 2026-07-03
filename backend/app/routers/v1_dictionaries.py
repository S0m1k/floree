"""Phase 2 — Posiflora-compatible /v1 reference dictionaries.

All dictionaries share the same list shape, so routes are registered from a
small registry instead of hand-writing near-identical handlers.
"""

from fastapi import APIRouter, Request, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.jsonapi import document
from app.serializers import dictionary_resource
from app.dictionary_models import (
    OrderTag,
    RecipeTag,
    DiscountReason,
    CashReason,
    CustomerPreference,
    CustomerSource,
    CustomerDealSource,
    CustomerCelebration,
    UnitOfMeasure,
)

router = APIRouter(prefix="/v1", tags=["v1-dictionaries"])

# (url path, ORM model, JSON:API type, extra static attributes)
_DICTS = [
    ("order-tags", OrderTag, "order-tags", None),
    ("recipe-tags", RecipeTag, "recipe-tags", None),
    ("discount-reasons", DiscountReason, "discount-reasons", {"discountType": "discount"}),
    ("cash-reasons", CashReason, "cash-reasons", None),
    ("customer-preferences", CustomerPreference, "customer-preferences", None),
    ("customer-sources", CustomerSource, "customer-sources", None),
    ("order-sources", CustomerDealSource, "order-sources", None),
    ("customer-celebrations", CustomerCelebration, "customer-celebrations", None),
    ("measures", UnitOfMeasure, "measures", None),
]


def _make_handler(model, type_: str, extra: dict | None):
    async def handler(request: Request, db: AsyncSession = Depends(get_db)):
        qs = request.query_params
        try:
            number = int(qs.get("page[number]", 1))
            size = int(qs.get("page[size]", 200))
        except (TypeError, ValueError):
            number, size = 1, 200
        base = select(model)
        total = (
            await db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        rows = (
            await db.execute(base.offset((number - 1) * size).limit(size))
        ).scalars().all()
        data = [dictionary_resource(r, type_, extra) for r in rows]
        return document(data, meta={"page": {"number": number, "size": size}, "total": total})

    return handler


for _path, _model, _type, _extra in _DICTS:
    router.add_api_route(
        f"/{_path}", _make_handler(_model, _type, _extra), methods=["GET"], name=f"list_{_path}"
    )
