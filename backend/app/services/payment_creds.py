"""T-Bank credentials resolution: admin-managed DB row wins, .env is fallback.

Keeps the historical .env flow working while letting the admin rotate keys
from /admin/payment-settings without SSH access or restarts.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dictionary_models import PaymentSettings


async def get_or_create_payment_settings(db: AsyncSession) -> PaymentSettings:
    row = (
        await db.execute(
            select(PaymentSettings).where(PaymentSettings.id == PaymentSettings.SINGLETON_ID)
        )
    ).scalar_one_or_none()
    if row is None:
        row = PaymentSettings(id=PaymentSettings.SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def get_tbank_credentials(db: AsyncSession) -> tuple[str, str]:
    """(terminal_key, secret_key): DB override first, else environment."""
    row = await get_or_create_payment_settings(db)
    terminal = (row.tbank_terminal_key or "").strip() or settings.tbank_terminal_key
    secret = (row.tbank_secret_key or "").strip() or settings.tbank_secret_key
    return terminal, secret
