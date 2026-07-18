"""Admin customer card + create/edit form endpoints (admin-map §2.5.1).

Write operations for /v1/customers plus the customer-card read extensions:
per-customer order stats, daily spend (the «Траты» bar chart) and the bonus
adjustment history. Orders are matched to a customer by the customer_id FK OR
by phone — legacy ETL rows predate the FK.
"""

import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Customer, CustomerBonusHistory, CustomerBonusGroupHistory
from app.loyalty_models import BonusGroup, DiscountGroup
from app.models import Order
from app.staff_models import Worker
from app.jsonapi import document, resource
from app.serializers import (
    customer_resource,
    customer_bonus_history_resource,
    customer_bonus_group_history_resource,
)
from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-customers"], dependencies=[Depends(get_current_worker)]
)

NAME_MAX_LEN = 64
EMAIL_MAX_LEN = 64
INSTAGRAM_MAX_LEN = 64
CARD_NUMBER_MAX_LEN = 32
PREFERENCES_MAX_LEN = 255
COMMENT_MAX_LEN = 500

GENDERS = ("male", "female", "other")
CUSTOMER_TYPES = ("person", "company")

# Manual balance adjustments on the «Бонусы» tab are logged with this comment.
BONUS_ADJUSTMENT_COMMENT = "Корректировка"


def _normalize_phone(raw) -> str | None:
    """Normalize a Russian phone to +7XXXXXXXXXX, or None if malformed."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 11 and digits[0] in "78":
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    else:
        return None
    return f"+{digits}"


def _validate_len(value: str | None, limit: int, field: str) -> None:
    if value is not None and len(value) > limit:
        raise HTTPException(
            status_code=400, detail=f"{field} exceeds {limit} characters"
        )


def _parse_birthday(raw) -> date | None:
    if raw in (None, ""):
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="birthday must be YYYY-MM-DD")


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


async def _phone_taken(db: AsyncSession, phone: str, exclude_id: str | None = None) -> bool:
    stmt = select(Customer.id).where(Customer.phone == phone)
    if exclude_id:
        stmt = stmt.where(Customer.id != exclude_id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None


def _validate_optional_fields(attrs: dict) -> dict:
    """Validate and collect the optional form fields shared by POST/PATCH.

    Returns {model_field: value} for every key present in `attrs` (value may
    be None — an explicit null clears the field).
    """
    out: dict = {}
    mapping = {
        "email": ("email", EMAIL_MAX_LEN),
        "instagram": ("instagram", INSTAGRAM_MAX_LEN),
        "cardNumber": ("card_number", CARD_NUMBER_MAX_LEN),
        "preferences": ("preferences", PREFERENCES_MAX_LEN),
        "notes": ("comment", COMMENT_MAX_LEN),
    }
    for attr, (field, limit) in mapping.items():
        if attr in attrs:
            value = attrs[attr]
            if value is not None and not isinstance(value, str):
                raise HTTPException(status_code=400, detail=f"{attr} must be a string")
            _validate_len(value, limit, attr)
            out[field] = value or None

    if "gender" in attrs:
        gender = attrs["gender"] or "other"
        if gender not in GENDERS:
            raise HTTPException(status_code=400, detail=f"gender must be one of {GENDERS}")
        out["gender"] = gender

    if "customerType" in attrs:
        customer_type = attrs["customerType"] or "person"
        if customer_type not in CUSTOMER_TYPES:
            raise HTTPException(
                status_code=400, detail=f"customerType must be one of {CUSTOMER_TYPES}"
            )
        out["customer_type"] = customer_type

    if "birthday" in attrs:
        out["birthday"] = _parse_birthday(attrs["birthday"])

    return out


@router.post("/customers", status_code=201)
async def create_customer(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a customer from the admin «Создание клиента» form."""
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "customers"):
        raise HTTPException(status_code=400, detail="data.type must be 'customers'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    name = (attrs.get("title") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Имя клиента обязательно")
    _validate_len(name, NAME_MAX_LEN, "title")

    phone = _normalize_phone(attrs.get("phone"))
    if phone is None:
        raise HTTPException(status_code=400, detail="Укажите корректный телефон")
    if await _phone_taken(db, phone):
        raise HTTPException(
            status_code=400, detail="Клиент с таким телефоном уже существует"
        )

    fields = _validate_optional_fields(attrs)
    customer = Customer(
        name=name,
        phone=phone,
        source_id=_rel_id(rels, "source") or attrs.get("sourceId"),
        **fields,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return document(customer_resource(customer))


@router.patch("/customers/{customer_id}")
async def update_customer(
    customer_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Edit a customer (admin form), adjust the bonus balance, and/or change
    their loyalty group assignment.

    A `bonusBalance` attribute is treated as a manual correction: the delta is
    appended to customer_bonus_history with the author from the JWT.

    A `relationships.bonusGroup`/`relationships.discountGroup` entry changes
    the customer's tier (admin-map §2.5.4-2.5.6, customer card «Бонусы» tab).
    This reuses the general customer PATCH instead of a dedicated
    `/loyalty` route — a group assignment is just another customer field, the
    same way `bonusBalance` already is on this endpoint, and the admin card's
    save flow already PATCHes this route for everything else on the page.
    A bonus-group change is logged to customer_bonus_group_history (the
    discount group isn't — Posiflora has no equivalent history screen for it).
    """
    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    if "title" in attrs:
        name = (attrs.get("title") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Имя клиента обязательно")
        _validate_len(name, NAME_MAX_LEN, "title")
        customer.name = name

    if "phone" in attrs:
        phone = _normalize_phone(attrs.get("phone"))
        if phone is None:
            raise HTTPException(status_code=400, detail="Укажите корректный телефон")
        if await _phone_taken(db, phone, exclude_id=customer.id):
            raise HTTPException(
                status_code=400, detail="Клиент с таким телефоном уже существует"
            )
        customer.phone = phone

    for field, value in _validate_optional_fields(attrs).items():
        setattr(customer, field, value)

    if "source" in rels or "sourceId" in attrs:
        customer.source_id = _rel_id(rels, "source") or attrs.get("sourceId")

    if "bonusBalance" in attrs:
        try:
            new_balance = int(attrs["bonusBalance"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="bonusBalance must be an integer")
        if new_balance < 0:
            raise HTTPException(status_code=400, detail="bonusBalance must be >= 0")
        delta = new_balance - (customer.bonus_balance or 0)
        if delta != 0:
            db.add(
                CustomerBonusHistory(
                    customer_id=customer.id,
                    amount=delta,
                    comment=BONUS_ADJUSTMENT_COMMENT,
                    worker_id=worker.id,
                )
            )
        customer.bonus_balance = new_balance

    if "bonusGroup" in rels:
        new_group_id = _rel_id(rels, "bonusGroup")
        if new_group_id is not None:
            exists = (
                await db.execute(select(BonusGroup.id).where(BonusGroup.id == new_group_id))
            ).scalar_one_or_none()
            if exists is None:
                raise HTTPException(status_code=400, detail="Бонусная группа не найдена")
        if new_group_id != customer.bonus_group_id:
            db.add(
                CustomerBonusGroupHistory(
                    customer_id=customer.id,
                    old_group_id=customer.bonus_group_id,
                    new_group_id=new_group_id,
                    worker_id=worker.id,
                    is_automatic=False,
                )
            )
            customer.bonus_group_id = new_group_id

    # «discountGroup» (singular) on write — our schema keeps one discount
    # group per customer even though the read side echoes it back as the
    # (0-or-1-item) Posiflora-shaped `discountGroups` relationship.
    if "discountGroup" in rels:
        new_discount_group_id = _rel_id(rels, "discountGroup")
        if new_discount_group_id is not None:
            exists = (
                await db.execute(
                    select(DiscountGroup.id).where(DiscountGroup.id == new_discount_group_id)
                )
            ).scalar_one_or_none()
            if exists is None:
                raise HTTPException(status_code=400, detail="Скидочная группа не найдена")
        customer.discount_group_id = new_discount_group_id

    await db.commit()
    await db.refresh(customer)
    return document(customer_resource(customer))


def _customer_orders_clause(customer: Customer):
    """Orders belong to the customer via FK or (legacy ETL rows) by phone."""
    if customer.phone:
        return or_(Order.customer_id == customer.id, Order.phone == customer.phone)
    return Order.customer_id == customer.id


async def _load_customer(db: AsyncSession, customer_id: str) -> Customer:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/customers/{customer_id}/stats")
async def get_customer_stats(customer_id: str, db: AsyncSession = Depends(get_db)):
    """Order aggregates for the customer-card stat tiles (Общая информация)."""
    customer = await _load_customer(db, customer_id)
    count, total, first_at, last_at = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Order.total_amount), 0),
                func.min(Order.created_at),
                func.max(Order.created_at),
            ).where(_customer_orders_clause(customer))
        )
    ).one()
    total = float(total)
    attrs = {
        "ordersCount": count,
        "ordersTotal": total,
        "avgCheck": round(total / count, 2) if count else 0,
        "firstOrderAt": first_at.isoformat() if isinstance(first_at, datetime) else first_at,
        "lastOrderAt": last_at.isoformat() if isinstance(last_at, datetime) else last_at,
    }
    return document(resource("customer-stats", customer.id, attrs))


@router.get("/customers/{customer_id}/spend")
async def get_customer_spend(
    customer_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Daily order sums for the «Траты» bar chart. filter[from]/filter[to]
    are inclusive YYYY-MM-DD bounds; default is the current month."""
    customer = await _load_customer(db, customer_id)
    qs = request.query_params

    today = date.today()
    try:
        date_from = date.fromisoformat(qs.get("filter[from]") or today.replace(day=1).isoformat())
        date_to = date.fromisoformat(qs.get("filter[to]") or today.isoformat())
    except ValueError:
        raise HTTPException(status_code=400, detail="filter[from]/filter[to] must be YYYY-MM-DD")

    stmt = (
        select(Order.created_at, Order.total_amount)
        .where(_customer_orders_clause(customer))
        .where(Order.created_at >= datetime.combine(date_from, datetime.min.time()))
        .where(Order.created_at < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1))
    )
    rows = (await db.execute(stmt)).all()

    # Python-side day grouping keeps this portable across SQLite/Postgres;
    # per-customer order volumes are small.
    by_day: dict[str, float] = {}
    for created_at, amount in rows:
        day = created_at.date().isoformat() if isinstance(created_at, datetime) else str(created_at)
        by_day[day] = by_day.get(day, 0.0) + float(amount or 0)

    days = [{"date": d, "amount": by_day[d]} for d in sorted(by_day)]
    attrs = {
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "days": days,
        "total": round(sum(by_day.values()), 2),
    }
    return document(resource("customer-spend", customer.id, attrs))


@router.get("/customers/{customer_id}/bonus-history")
async def get_customer_bonus_history(
    customer_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """«История списаний и начислений бонусов» (customer card, Бонусы tab)."""
    customer = await _load_customer(db, customer_id)
    qs = request.query_params

    stmt = select(CustomerBonusHistory).where(
        CustomerBonusHistory.customer_id == customer.id
    )
    date_from = qs.get("filter[from]")
    if date_from:
        stmt = stmt.where(CustomerBonusHistory.created_at >= datetime.fromisoformat(date_from))
    date_to = qs.get("filter[to]")
    if date_to:
        stmt = stmt.where(
            CustomerBonusHistory.created_at
            < datetime.fromisoformat(date_to) + timedelta(days=1)
        )

    rows = (
        await db.execute(stmt.order_by(CustomerBonusHistory.created_at.desc()))
    ).scalars().all()
    return document([customer_bonus_history_resource(h) for h in rows])


@router.get("/customers/{customer_id}/bonus-group-history")
async def get_customer_bonus_group_history(
    customer_id: str, db: AsyncSession = Depends(get_db)
):
    """«История изменения бонусных групп» (customer card, Бонусы tab) — every
    manual (PATCH /v1/customers/{id}) or automatic
    (POST /v1/bonus-groups/recalculate) tier change for this customer."""
    customer = await _load_customer(db, customer_id)
    rows = (
        await db.execute(
            select(CustomerBonusGroupHistory)
            .where(CustomerBonusGroupHistory.customer_id == customer.id)
            .order_by(CustomerBonusGroupHistory.changed_at.desc())
        )
    ).scalars().all()
    return document([customer_bonus_group_history_resource(h) for h in rows])
