"""Storefront promo codes.

Discounts are applied strictly server-side in the order create flow — the
client only ever sends the code string. Codes are case-insensitive.
"""

from decimal import Decimal

# code (uppercase) -> discount percent
PROMO_CODES: dict[str, Decimal] = {
    "ШКОЛА": Decimal("15"),
}


def normalize_code(raw: str | None) -> str:
    return (raw or "").strip().upper()


def get_discount_percent(raw_code: str | None) -> Decimal | None:
    """Return the discount percent for a promo code, or None if unknown."""
    return PROMO_CODES.get(normalize_code(raw_code))
