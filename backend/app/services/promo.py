"""Storefront promo codes, backed by the admin-managed promo_codes table.

Discounts are applied strictly server-side in the order create flow — the
client only ever sends the code string. Codes are case-insensitive; a
deactivated code behaves exactly like a missing one.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dictionary_models import PromoCode

# Seeded on startup so the shop is never left without its launch promo after
# a fresh deploy; admins manage the live list from /admin/payment-settings.
DEFAULT_CODES: dict[str, Decimal] = {
    "ШКОЛА": Decimal("15"),
}


def normalize_code(raw: str | None) -> str:
    return (raw or "").strip().upper()


async def get_discount_percent(db: AsyncSession, raw_code: str | None) -> Decimal | None:
    """Return the discount percent for an active promo code, else None."""
    code = normalize_code(raw_code)
    if not code:
        return None
    row = (
        await db.execute(select(PromoCode).where(PromoCode.id == code))
    ).scalar_one_or_none()
    if row is None or not row.is_active:
        return None
    return Decimal(row.percent)


async def seed_default_codes(db: AsyncSession) -> None:
    """Insert DEFAULT_CODES that don't exist yet (never overwrites edits)."""
    for code, percent in DEFAULT_CODES.items():
        exists = (
            await db.execute(select(PromoCode.id).where(PromoCode.id == code))
        ).scalar_one_or_none()
        if exists is None:
            db.add(PromoCode(id=code, percent=percent, is_active=True))
    await db.commit()
