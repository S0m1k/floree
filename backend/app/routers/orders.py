import json
import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Order
from app.schemas import OrderCreate, OrderResponse
from app.services.posiflora import create_order as posiflora_create_order

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderResponse)
async def create_order(payload: OrderCreate, db: AsyncSession = Depends(get_db)):
    doc_no = str(int(time.time() * 1000))[-12:]

    # Combined address string for local DB (Posiflora gets structured fields)
    addr_parts = [payload.city, f"{payload.street}, {payload.house}"]
    if payload.apartment:
        addr_parts.append(f"кв. {payload.apartment}")
    combined_address = ", ".join(addr_parts)

    # Build ISO due_time (Moscow) if both date+time provided — for local DB record
    local_due_time = None
    if payload.delivery_date and payload.delivery_time:
        local_due_time = f"{payload.delivery_date}T{payload.delivery_time}:00+03:00"

    # 1. Create in Posiflora (best-effort — don't fail if Posiflora is down)
    items_payload = [i.model_dump() for i in payload.items]
    posiflora_id = None
    posiflora_doc_no = None
    try:
        pf_resp = await posiflora_create_order(
            customer_name=payload.customer_name,
            phone=payload.phone,
            city=payload.city,
            street=payload.street,
            house=payload.house,
            apartment=payload.apartment,
            delivery_date=payload.delivery_date,
            delivery_time=payload.delivery_time,
            comment=payload.comment,
            items=items_payload,
            doc_no=doc_no,
        )
        posiflora_id = pf_resp["data"]["id"]
        posiflora_doc_no = pf_resp["data"]["attributes"].get("docNo")
    except Exception as e:
        # Log but continue — order is still saved locally
        print(f"[Posiflora] Order creation failed: {e}")

    # 2. Save to DB (`bouquet_ids` column repurposed to store recipe order items as JSON)
    order = Order(
        posiflora_id=posiflora_id,
        posiflora_doc_no=posiflora_doc_no or doc_no,
        customer_name=payload.customer_name,
        phone=payload.phone,
        address=combined_address,
        comment=payload.comment,
        due_time=local_due_time,
        total_amount=payload.total_amount,
        status="pending",
        bouquet_ids=json.dumps(items_payload),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
