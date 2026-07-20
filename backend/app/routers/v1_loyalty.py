"""Клиенты и развитие → Система лояльности (admin-map §2.5.4-2.5.6).

CRUD for bonus groups, discount groups and bonus-card (Wallet) templates,
plus the automatic re-assignment sweep (POST /v1/bonus-groups/recalculate)
that mirrors how live Posiflora moves a customer between bonus tiers as their
lifetime order total grows. Assigning a customer to a group (manually, via
PATCH /v1/customers/{id}) lives in v1_customers.py next to the rest of the
customer-card write logic — see the comment there for why.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Customer, CustomerBonusGroupHistory
from app.loyalty_models import BonusGroup, DiscountGroup, BonusCard
from app.models import Order
from app.jsonapi import document
from app.serializers import bonus_group_resource, discount_group_resource, bonus_card_resource
from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-loyalty"], dependencies=[Depends(get_current_worker)]
)

TITLE_MAX = 100
STATUSES = ("active", "archived")


def _extract_title(attrs: dict) -> str:
    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"title exceeds {TITLE_MAX} characters")
    return title


def _extract_percent(attrs: dict, key: str, default: int = 0) -> int:
    if key not in attrs or attrs[key] is None:
        return default
    value = attrs[key]
    if not isinstance(value, int) or isinstance(value, bool):
        raise HTTPException(status_code=400, detail=f"{key} must be an integer")
    if value < 0 or value > 100:
        raise HTTPException(status_code=400, detail=f"{key} must be between 0 and 100")
    return value


def _extract_threshold(attrs: dict, key: str = "entryThreshold", default: int = 0) -> int:
    if key not in attrs or attrs[key] is None:
        return default
    value = attrs[key]
    if not isinstance(value, int) or isinstance(value, bool):
        raise HTTPException(status_code=400, detail=f"{key} must be an integer")
    if value < 0:
        raise HTTPException(status_code=400, detail=f"{key} must be >= 0")
    return value


def _extract_status(attrs: dict, default: str = "active") -> str:
    if "status" not in attrs or attrs["status"] is None:
        return default
    status = attrs["status"]
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {STATUSES}")
    return status


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


async def _list(db: AsyncSession, request: Request, model, resource_fn):
    qs = request.query_params
    try:
        number = int(qs.get("page[number]", 1))
        size = int(qs.get("page[size]", 200))
    except (TypeError, ValueError):
        number, size = 1, 200
    base = select(model)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.offset((number - 1) * size).limit(size))).scalars().all()
    return document(
        [resource_fn(r) for r in rows],
        meta={"page": {"number": number, "size": size}, "total": total},
    )


# ---------- bonus groups ----------


@router.get("/bonus-groups")
async def list_bonus_groups(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, request, BonusGroup, bonus_group_resource)


@router.post("/bonus-groups", status_code=201)
async def create_bonus_group(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    row = BonusGroup(
        title=_extract_title(attrs),
        accrual_percent=_extract_percent(attrs, "accrualPercent"),
        max_percent=_extract_percent(attrs, "maxPercent"),
        entry_threshold=_extract_threshold(attrs),
        is_public=bool(attrs.get("isPublic", True)),
        status=_extract_status(attrs),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(bonus_group_resource(row))


@router.patch("/bonus-groups/{group_id}")
async def update_bonus_group(group_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(select(BonusGroup).where(BonusGroup.id == group_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")

    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}

    if "title" in attrs:
        row.title = _extract_title(attrs)
    if "accrualPercent" in attrs:
        row.accrual_percent = _extract_percent(attrs, "accrualPercent")
    if "maxPercent" in attrs:
        row.max_percent = _extract_percent(attrs, "maxPercent")
    if "entryThreshold" in attrs:
        row.entry_threshold = _extract_threshold(attrs)
    if "isPublic" in attrs:
        row.is_public = bool(attrs["isPublic"])
    if "status" in attrs:
        row.status = _extract_status(attrs)

    await db.commit()
    await db.refresh(row)
    return document(bonus_group_resource(row))


@router.delete("/bonus-groups/{group_id}", status_code=204)
async def delete_bonus_group(group_id: str, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(select(BonusGroup).where(BonusGroup.id == group_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    linked = (
        await db.execute(
            select(func.count()).where(Customer.bonus_group_id == group_id)
        )
    ).scalar_one()
    if linked:
        raise HTTPException(status_code=409, detail="К группе привязаны клиенты")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- discount groups ----------


@router.get("/discount-groups")
async def list_discount_groups(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, request, DiscountGroup, discount_group_resource)


@router.post("/discount-groups", status_code=201)
async def create_discount_group(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    row = DiscountGroup(
        title=_extract_title(attrs),
        discount_percent=_extract_percent(attrs, "discountPercent"),
        entry_threshold=_extract_threshold(attrs),
        is_public=bool(attrs.get("isPublic", True)),
        status=_extract_status(attrs),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(discount_group_resource(row))


@router.patch("/discount-groups/{group_id}")
async def update_discount_group(
    group_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    row = (
        await db.execute(select(DiscountGroup).where(DiscountGroup.id == group_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")

    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}

    if "title" in attrs:
        row.title = _extract_title(attrs)
    if "discountPercent" in attrs:
        row.discount_percent = _extract_percent(attrs, "discountPercent")
    if "entryThreshold" in attrs:
        row.entry_threshold = _extract_threshold(attrs)
    if "isPublic" in attrs:
        row.is_public = bool(attrs["isPublic"])
    if "status" in attrs:
        row.status = _extract_status(attrs)

    await db.commit()
    await db.refresh(row)
    return document(discount_group_resource(row))


@router.delete("/discount-groups/{group_id}", status_code=204)
async def delete_discount_group(group_id: str, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(select(DiscountGroup).where(DiscountGroup.id == group_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    linked = (
        await db.execute(
            select(func.count()).where(Customer.discount_group_id == group_id)
        )
    ).scalar_one()
    if linked:
        raise HTTPException(status_code=409, detail="К группе привязаны клиенты")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- bonus cards (Wallet templates) ----------


@router.get("/bonus-cards")
async def list_bonus_cards(request: Request, db: AsyncSession = Depends(get_db)):
    return await _list(db, request, BonusCard, bonus_card_resource)


@router.post("/bonus-cards", status_code=201)
async def create_bonus_card(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}
    row = BonusCard(
        title=_extract_title(attrs),
        shop_name=(attrs.get("shopName") or None),
        logo_id=_rel_id(rels, "logo") or attrs.get("logoId"),
        status=_extract_status(attrs),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(bonus_card_resource(row))


@router.patch("/bonus-cards/{card_id}")
async def update_bonus_card(card_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(select(BonusCard).where(BonusCard.id == card_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    if "title" in attrs:
        row.title = _extract_title(attrs)
    if "shopName" in attrs:
        row.shop_name = attrs.get("shopName") or None
    if "status" in attrs:
        row.status = _extract_status(attrs)
    if "logo" in rels or "logoId" in attrs:
        row.logo_id = _rel_id(rels, "logo") or attrs.get("logoId")

    await db.commit()
    await db.refresh(row)
    return document(bonus_card_resource(row))


@router.delete("/bonus-cards/{card_id}", status_code=204)
async def delete_bonus_card(card_id: str, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(select(BonusCard).where(BonusCard.id == card_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- automatic tier assignment ----------


async def _customer_order_total(db: AsyncSession, customer: Customer) -> float:
    """Lifetime order total, matched by the customer_id FK OR (legacy ETL
    rows) by phone — same convention as v1_customers._customer_orders_clause.
    """
    clause = (
        or_(Order.customer_id == customer.id, Order.phone == customer.phone)
        if customer.phone
        else Order.customer_id == customer.id
    )
    total = (
        await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(clause))
    ).scalar_one()
    return float(total)


def _pick_group(groups_desc: list[BonusGroup], total: float) -> BonusGroup | None:
    """`groups_desc` sorted by entry_threshold descending — the largest tier
    whose threshold the customer's order total clears."""
    for g in groups_desc:
        if total >= g.entry_threshold:
            return g
    return None


@router.post("/bonus-groups/recalculate")
async def recalculate_bonus_groups(db: AsyncSession = Depends(get_db)):
    """Re-assign every customer's bonus group by lifetime order total (the
    largest entryThreshold <= total spent) — how live Posiflora moves
    customers between tiers automatically. Writes customer_bonus_group_history
    with is_automatic=True (worker_id NULL) for every customer whose group
    actually changes. Returns {"updated": N}."""
    groups = (
        await db.execute(
            select(BonusGroup)
            .where(BonusGroup.status == "active")
            .order_by(BonusGroup.entry_threshold.desc())
        )
    ).scalars().all()
    customers = (await db.execute(select(Customer))).scalars().all()

    updated = 0
    for customer in customers:
        total = await _customer_order_total(db, customer)
        target = _pick_group(groups, total)
        target_id = target.id if target else None
        if target_id != customer.bonus_group_id:
            db.add(
                CustomerBonusGroupHistory(
                    customer_id=customer.id,
                    old_group_id=customer.bonus_group_id,
                    new_group_id=target_id,
                    worker_id=None,
                    is_automatic=True,
                )
            )
            customer.bonus_group_id = target_id
            updated += 1

    await db.commit()
    return {"updated": updated}
