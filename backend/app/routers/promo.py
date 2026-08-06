from fastapi import APIRouter
from pydantic import BaseModel
from app.services.promo import get_discount_percent, normalize_code

router = APIRouter(prefix="/promo-codes", tags=["promo"])


class PromoCheckResponse(BaseModel):
    code: str
    valid: bool
    percent: float


@router.get("/{code}", response_model=PromoCheckResponse)
async def check_promo_code(code: str):
    """Validate a promo code for the checkout UI.

    Display-only: the authoritative discount is recomputed in the order
    create flow, so a forged client never gets more than the server allows.
    """
    percent = get_discount_percent(code)
    return PromoCheckResponse(
        code=normalize_code(code),
        valid=percent is not None,
        percent=float(percent) if percent is not None else 0.0,
    )
