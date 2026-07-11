"""Phase 2 — Posiflora-compatible /v1 reference dictionaries.

All dictionaries share the same list/create/delete shape, so routes are
registered from a small registry instead of hand-writing near-identical
handlers (admin-map §2.7). Two dictionaries carry extra fields beyond title —
`customer-celebrations` (a period) and `measures` (short name + ОКЕИ measure
code) — and are the only two that also get a PATCH route; the rest are
Posiflora-style chip lists (add/remove only, no edit).

`personal-data` is a singleton template (not a list) and is wired separately
at the bottom of this module.
"""

import re
from datetime import date

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.jsonapi import document
from app.serializers import dictionary_resource, personal_data_resource
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
    PersonalDataTemplate,
)

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-dictionaries"], dependencies=[Depends(get_current_worker)]
)

TITLE_MAX = 50

# (url path, ORM model, JSON:API type, extra static attributes, kind)
# kind: "simple" (title only), "celebration" (+ dateFrom/dateTo, PATCHable),
# "measure" (+ shortName/measureCode, PATCHable).
_DICTS = [
    ("order-tags", OrderTag, "order-tags", None, "simple"),
    ("recipe-tags", RecipeTag, "recipe-tags", None, "simple"),
    ("discount-reasons", DiscountReason, "discount-reasons", {"discountType": "discount"}, "simple"),
    ("cash-reasons", CashReason, "cash-reasons", None, "simple"),
    ("customer-preferences", CustomerPreference, "customer-preferences", None, "simple"),
    ("customer-sources", CustomerSource, "customer-sources", None, "simple"),
    ("order-sources", CustomerDealSource, "order-sources", None, "simple"),
    ("customer-celebrations", CustomerCelebration, "customer-celebrations", None, "celebration"),
    ("measures", UnitOfMeasure, "measures", None, "measure"),
]


def _make_list_handler(model, type_: str, extra: dict | None):
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


def _parse_date_field(value, field: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be an ISO date (YYYY-MM-DD)")


def _parse_measure_code(value):
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise HTTPException(status_code=400, detail="measureCode must be an integer")
    return value


async def _check_title_unique(db: AsyncSession, model, title: str, exclude_id: str | None = None) -> None:
    stmt = select(model).where(model.title == title)
    if exclude_id is not None:
        stmt = stmt.where(model.id != exclude_id)
    if (await db.execute(stmt)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="title already exists in this dictionary")


def _extract_title(attrs: dict) -> str:
    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {TITLE_MAX} characters")
    return title


def _make_create_handler(model, type_: str, extra: dict | None, kind: str):
    async def handler(request: Request, db: AsyncSession = Depends(get_db)):
        body = await request.json()
        data = (body or {}).get("data") or {}
        attrs = data.get("attributes") or {}

        title = _extract_title(attrs)
        await _check_title_unique(db, model, title)

        kwargs = {"title": title}
        if kind == "celebration":
            kwargs["date_from"] = _parse_date_field(attrs.get("dateFrom"), "dateFrom")
            kwargs["date_to"] = _parse_date_field(attrs.get("dateTo"), "dateTo")
        elif kind == "measure":
            short_name = attrs.get("shortName")
            kwargs["short_name"] = (str(short_name).strip() or None) if short_name is not None else None
            kwargs["measure_code"] = _parse_measure_code(attrs.get("measureCode"))

        row = model(**kwargs)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return document(dictionary_resource(row, type_, extra))

    return handler


def _make_delete_handler(model):
    async def handler(id: str, db: AsyncSession = Depends(get_db)):
        row = (await db.execute(select(model).where(model.id == id))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        await db.delete(row)
        await db.commit()
        return Response(status_code=204)

    return handler


def _make_patch_handler(model, type_: str, extra: dict | None, kind: str):
    async def handler(id: str, request: Request, db: AsyncSession = Depends(get_db)):
        row = (await db.execute(select(model).where(model.id == id))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")

        body = await request.json()
        data = (body or {}).get("data") or {}
        attrs = data.get("attributes") or {}

        if "title" in attrs:
            title = _extract_title(attrs)
            await _check_title_unique(db, model, title, exclude_id=row.id)
            row.title = title

        if kind == "celebration":
            if "dateFrom" in attrs:
                row.date_from = _parse_date_field(attrs.get("dateFrom"), "dateFrom")
            if "dateTo" in attrs:
                row.date_to = _parse_date_field(attrs.get("dateTo"), "dateTo")
        elif kind == "measure":
            if "shortName" in attrs:
                short_name = attrs.get("shortName")
                row.short_name = (str(short_name).strip() or None) if short_name is not None else None
            if "measureCode" in attrs:
                row.measure_code = _parse_measure_code(attrs.get("measureCode"))

        await db.commit()
        await db.refresh(row)
        return document(dictionary_resource(row, type_, extra))

    return handler


for _path, _model, _type, _extra, _kind in _DICTS:
    router.add_api_route(
        f"/{_path}", _make_list_handler(_model, _type, _extra), methods=["GET"], name=f"list_{_path}"
    )
    router.add_api_route(
        f"/{_path}",
        _make_create_handler(_model, _type, _extra, _kind),
        methods=["POST"],
        status_code=201,
        name=f"create_{_path}",
    )
    router.add_api_route(
        f"/{_path}/{{id}}",
        _make_delete_handler(_model),
        methods=["DELETE"],
        status_code=204,
        name=f"delete_{_path}",
    )
    if _kind in ("celebration", "measure"):
        router.add_api_route(
            f"/{_path}/{{id}}",
            _make_patch_handler(_model, _type, _extra, _kind),
            methods=["PATCH"],
            name=f"update_{_path}",
        )


# ---------- personal-data (singleton template) ----------

_INN_RE = re.compile(r"^\d{10}$|^\d{12}$")


async def _get_or_create_personal_data(db: AsyncSession) -> PersonalDataTemplate:
    row = (
        await db.execute(
            select(PersonalDataTemplate).where(
                PersonalDataTemplate.id == PersonalDataTemplate.SINGLETON_ID
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = PersonalDataTemplate(id=PersonalDataTemplate.SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


@router.get("/personal-data")
async def get_personal_data(db: AsyncSession = Depends(get_db)):
    row = await _get_or_create_personal_data(db)
    return document(personal_data_resource(row))


@router.put("/personal-data")
async def update_personal_data(request: Request, db: AsyncSession = Depends(get_db)):
    row = await _get_or_create_personal_data(db)

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}

    if "ipTitle" in attrs:
        row.ip_title = (attrs.get("ipTitle") or "").strip() or None
    if "inn" in attrs:
        inn = (attrs.get("inn") or "").strip()
        if inn and not _INN_RE.match(inn):
            raise HTTPException(status_code=400, detail="inn must be 10 or 12 digits")
        row.inn = inn or None
    if "legalAddress" in attrs:
        row.legal_address = (attrs.get("legalAddress") or "").strip() or None
    if "website" in attrs:
        row.website = (attrs.get("website") or "").strip() or None
    if "email" in attrs:
        row.email = (attrs.get("email") or "").strip() or None

    await db.commit()
    await db.refresh(row)
    return document(personal_data_resource(row))
