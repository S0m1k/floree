from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import CallbackRequest
from app.config import use_posiflora
from app.services.posiflora import create_callback_order

router = APIRouter(prefix="/callback-requests", tags=["callbacks"])

ALLOWED_CONTACT_METHODS = {"Позвонить", "Max", "Telegram", "WhatsApp"}


class CallbackRequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=5, max_length=32)
    contact_method: str
    recipe_id: str | None = Field(default=None, max_length=64)
    recipe_title: str | None = Field(default=None, max_length=300)


class CallbackRequestResponse(BaseModel):
    id: str
    status: str


@router.post("", response_model=CallbackRequestResponse)
async def create_callback_request(
    payload: CallbackRequestCreate, db: AsyncSession = Depends(get_db)
):
    if payload.contact_method not in ALLOWED_CONTACT_METHODS:
        raise HTTPException(status_code=422, detail="Недопустимый способ связи")

    req = CallbackRequest(
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        contact_method=payload.contact_method,
        recipe_id=payload.recipe_id,
        recipe_title=payload.recipe_title,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    # В режиме posiflora флористы живут в вендорской Посифлоре — заявка,
    # оставшаяся только в нашей таблице, для них невидима. Дублируем её туда
    # заказом-заявкой. Best-effort: сбой у вендора не должен ронять форму —
    # копия в CRM уже сохранена, ошибка уходит в лог.
    if use_posiflora():
        try:
            await create_callback_order(
                name=req.name,
                phone=req.phone,
                contact_method=req.contact_method,
                recipe_title=req.recipe_title,
            )
        except Exception as e:
            print(f"[Posiflora] Callback push failed: {e}")

    return CallbackRequestResponse(id=req.id, status=req.status)
