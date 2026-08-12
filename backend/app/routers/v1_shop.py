"""Онлайн-витрина — admin «Онлайн-витрина» screen (admin-map §2.3.2).

In Posiflora this is a paid upsell landing page. In our clone the storefront
is real (this same repo's public pages — `src/app/(main)`, `/catalog`,
`/recipe/[id]`, backed by `src/lib/posiflora.ts`), so this screen manages
actual settings for it: contact info shown to customers, social links, an
on/off switch and an announcement banner — plus a read-only summary of what's
currently published.

`shop_settings` is a singleton table (same pattern as `personal_data_templates`,
0010_personal_data): GET/PUT never have to guess which row to use. The
storefront pages themselves don't read these settings yet (see the UI hint
on the admin screen) — that wiring is a follow-up.
"""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dictionary_models import ShopSettings, CustomerDealSource
from app.catalog_models import Specification
from app.inventory_models import Item
from app.models import Order
from app.jsonapi import document
from app.serializers import shop_settings_resource, promo_code_resource, payment_settings_resource

from app.deps import get_current_worker

router = APIRouter(prefix="/v1", tags=["v1-shop"], dependencies=[Depends(get_current_worker)])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_DIGITS_RE = re.compile(r"^\d{4,15}$")

# Order source dictionary entries whose title marks an order as placed via the
# public storefront (case-insensitive match — the dictionary is admin-editable
# free text, no fixed id to key off of).
_WEBSITE_SOURCE_TITLES = {"сайт", "website", "floree.ru"}


def _utcnow_naive() -> datetime:
    """Naive UTC now — DB datetimes are stored naive, so comparisons must be
    naive too."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_or_create_settings(db: AsyncSession) -> ShopSettings:
    row = (
        await db.execute(
            select(ShopSettings).where(ShopSettings.id == ShopSettings.SINGLETON_ID)
        )
    ).scalar_one_or_none()
    if row is None:
        row = ShopSettings(id=ShopSettings.SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


@router.get("/shop-settings")
async def get_shop_settings(db: AsyncSession = Depends(get_db)):
    row = await _get_or_create_settings(db)
    return document(shop_settings_resource(row))


@router.put("/shop-settings")
async def update_shop_settings(request: Request, db: AsyncSession = Depends(get_db)):
    row = await _get_or_create_settings(db)

    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}

    if "shopTitle" in attrs:
        row.shop_title = (attrs.get("shopTitle") or "").strip() or None
    if "phone" in attrs:
        phone = (attrs.get("phone") or "").strip()
        if phone:
            digits = re.sub(r"\D", "", phone)
            if not _PHONE_DIGITS_RE.match(digits):
                raise HTTPException(status_code=400, detail="phone must be 4-15 digits")
        row.phone = phone or None
    if "address" in attrs:
        row.address = (attrs.get("address") or "").strip() or None
    if "emailOrders" in attrs:
        email = (attrs.get("emailOrders") or "").strip()
        if email and not _EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="emailOrders must be a valid email")
        row.email_orders = email or None
    if "instagram" in attrs:
        row.instagram = (attrs.get("instagram") or "").strip() or None
    if "telegram" in attrs:
        row.telegram = (attrs.get("telegram") or "").strip() or None
    if "whatsapp" in attrs:
        row.whatsapp = (attrs.get("whatsapp") or "").strip() or None
    if "isEnabled" in attrs:
        row.is_enabled = bool(attrs.get("isEnabled"))
    if "announcement" in attrs:
        row.announcement = (attrs.get("announcement") or "").strip() or None

    await db.commit()
    await db.refresh(row)
    return document(shop_settings_resource(row))


@router.get("/shop-summary")
async def shop_summary(db: AsyncSession = Depends(get_db)):
    total_recipes = (
        await db.execute(
            select(func.count()).select_from(Specification).where(Specification.status != "deleted")
        )
    ).scalar_one()
    published_recipes = (
        await db.execute(
            select(func.count())
            .select_from(Specification)
            .where(
                Specification.status == "on",
                Specification.public.is_(True),
            )
        )
    ).scalar_one()
    published_items = (
        await db.execute(
            select(func.count())
            .select_from(Item)
            .where(
                Item.status != "deleted",
                Item.public.is_(True),
            )
        )
    ).scalar_one()

    # Filtered in Python rather than via SQL LOWER(): SQLite's built-in LOWER()
    # only folds ASCII, so it would silently miss a Cyrillic title like «Сайт».
    all_sources = (await db.execute(select(CustomerDealSource.id, CustomerDealSource.title))).all()
    website_source_ids = [
        source_id for source_id, title in all_sources if (title or "").strip().lower() in _WEBSITE_SOURCE_TITLES
    ]

    has_website_source = bool(website_source_ids)
    last_orders = 0
    if has_website_source:
        since = _utcnow_naive() - timedelta(days=7)
        last_orders = (
            await db.execute(
                select(func.count())
                .select_from(Order)
                .where(Order.source_id.in_(website_source_ids), Order.created_at >= since)
            )
        ).scalar_one()

    attrs = {
        "publishedRecipes": published_recipes,
        "totalRecipes": total_recipes,
        "publishedItems": published_items,
        "lastOrders": last_orders,
        "lastOrdersSourceFound": has_website_source,
    }
    return {"data": {"type": "shop-summary", "id": "singleton", "attributes": attrs}}


# ---------- Оплата и промокоды (/admin/payment-settings) ----------

@router.get("/payment-settings")
async def get_payment_settings(db: AsyncSession = Depends(get_db)):
    from app.services.payment_creds import get_or_create_payment_settings
    row = await get_or_create_payment_settings(db)
    return document(payment_settings_resource(row))


@router.put("/payment-settings")
async def update_payment_settings(request: Request, db: AsyncSession = Depends(get_db)):
    from app.services.payment_creds import get_or_create_payment_settings
    row = await get_or_create_payment_settings(db)
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    if "terminalKey" in attrs:
        row.tbank_terminal_key = (attrs.get("terminalKey") or "").strip() or None
    # Пустой секрет в форме означает «не менять» — чтобы сохранение других
    # полей не требовало перепечатывать пароль каждый раз.
    if attrs.get("secretKey"):
        row.tbank_secret_key = str(attrs["secretKey"]).strip()
    if attrs.get("clearSecret"):
        row.tbank_secret_key = None
    if "activeProvider" in attrs:
        provider = str(attrs.get("activeProvider") or "tbank")
        if provider not in ("tbank", "yandex"):
            raise HTTPException(status_code=400, detail="Провайдер: tbank или yandex")
        row.active_provider = provider
    if "yapayMerchantId" in attrs:
        row.yapay_merchant_id = (attrs.get("yapayMerchantId") or "").strip() or None
    if attrs.get("yapayApiKey"):
        row.yapay_api_key = str(attrs["yapayApiKey"]).strip()
    if attrs.get("clearYapayApiKey"):
        row.yapay_api_key = None
    if "yapaySandbox" in attrs:
        row.yapay_sandbox = bool(attrs.get("yapaySandbox"))
    await db.commit()
    await db.refresh(row)
    return document(payment_settings_resource(row))


@router.get("/promo-codes")
async def list_promo_codes(db: AsyncSession = Depends(get_db)):
    from app.dictionary_models import PromoCode
    rows = (await db.execute(select(PromoCode).order_by(PromoCode.id))).scalars().all()
    return {"data": [promo_code_resource(r) for r in rows], "meta": {"total": len(rows)}}


@router.post("/promo-codes")
async def upsert_promo_code(request: Request, db: AsyncSession = Depends(get_db)):
    from decimal import Decimal, InvalidOperation
    from app.dictionary_models import PromoCode
    from app.services.promo import normalize_code

    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    code = normalize_code(attrs.get("code"))
    if not code or len(code) > 40:
        raise HTTPException(status_code=400, detail="Код: 1-40 символов")
    try:
        percent = Decimal(str(attrs.get("percent")))
    except (InvalidOperation, TypeError):
        raise HTTPException(status_code=400, detail="Скидка должна быть числом")
    if not (Decimal("0") < percent <= Decimal("100")):
        raise HTTPException(status_code=400, detail="Скидка: от 0.01 до 100 процентов")

    row = (await db.execute(select(PromoCode).where(PromoCode.id == code))).scalar_one_or_none()
    if row is None:
        row = PromoCode(id=code)
        db.add(row)
    row.percent = percent
    row.is_active = bool(attrs.get("isActive", True))
    await db.commit()
    await db.refresh(row)
    return document(promo_code_resource(row))


@router.delete("/promo-codes/{code}")
async def delete_promo_code(code: str, db: AsyncSession = Depends(get_db)):
    from app.dictionary_models import PromoCode
    from app.services.promo import normalize_code
    row = (
        await db.execute(select(PromoCode).where(PromoCode.id == normalize_code(code)))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    await db.delete(row)
    await db.commit()
    return {"meta": {"deleted": True}}


# ---------- Импорт из Posiflora (/admin/posiflora-import) ----------

@router.get("/posiflora-settings")
async def get_posiflora_settings(db: AsyncSession = Depends(get_db)):
    from app.services.import_runner import get_or_create_posiflora_settings
    row = await get_or_create_posiflora_settings(db)
    return {"data": {"id": row.id, "type": "posiflora-settings", "attributes": {
        "baseUrl": row.base_url,
        "username": row.username,
        "hasPassword": bool(row.password),
    }}}


@router.put("/posiflora-settings")
async def update_posiflora_settings(request: Request, db: AsyncSession = Depends(get_db)):
    from app.services.import_runner import get_or_create_posiflora_settings
    row = await get_or_create_posiflora_settings(db)
    attrs = (((await request.json()) or {}).get("data") or {}).get("attributes") or {}
    if "baseUrl" in attrs:
        row.base_url = (attrs.get("baseUrl") or "").strip().rstrip("/") or None
    if "username" in attrs:
        row.username = (attrs.get("username") or "").strip() or None
    if attrs.get("password"):
        row.password = str(attrs["password"]).strip()
    await db.commit()
    return {"data": {"id": row.id, "type": "posiflora-settings", "attributes": {
        "baseUrl": row.base_url,
        "username": row.username,
        "hasPassword": bool(row.password),
    }}}


def _import_run_resource(run) -> dict:
    return {"id": run.id, "type": "import-runs", "attributes": {
        "status": run.status,
        "log": run.log,
        "error": run.error,
        "startedAt": run.started_at.isoformat() if run.started_at else None,
        "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
    }}


@router.post("/posiflora-import/run")
async def start_posiflora_import():
    from app.services.import_runner import start_import
    try:
        run_id = await start_import()
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"data": {"id": run_id, "type": "import-runs", "attributes": {"status": "running"}}}


@router.get("/posiflora-import/status")
async def posiflora_import_status(db: AsyncSession = Depends(get_db)):
    from app.dictionary_models import ImportRun
    run = (
        await db.execute(select(ImportRun).order_by(ImportRun.started_at.desc()).limit(1))
    ).scalar_one_or_none()
    return {"data": _import_run_resource(run) if run else None}
