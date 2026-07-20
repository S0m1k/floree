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
from app.serializers import shop_settings_resource

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
