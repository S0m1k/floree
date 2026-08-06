from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.promo import get_discount_percent, normalize_code

router = APIRouter(prefix="/promo-codes", tags=["promo"])


class PromoCheckResponse(BaseModel):
    code: str
    valid: bool
    percent: float


@router.get("/{code}", response_model=PromoCheckResponse)
async def check_promo_code(code: str, db: AsyncSession = Depends(get_db)):
    """Validate a promo code for the checkout UI.

    Display-only: the authoritative discount is recomputed in the order
    create flow, so a forged client never gets more than the server allows.
    """
    percent = await get_discount_percent(db, code)
    return PromoCheckResponse(
        code=normalize_code(code),
        valid=percent is not None,
        percent=float(percent) if percent is not None else 0.0,
    )
