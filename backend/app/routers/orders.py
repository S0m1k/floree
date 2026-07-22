import json
import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Order
from app.schemas import OrderCreate, OrderResponse
from app.services.posiflora import get_variant_price

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

    # --- FIX #1: resolve authoritative prices server-side; never trust client ---
    resolved_items: list[dict] = []
    server_total = 0
    for item in payload.items:
        try:
            unit_price, resolved_swv_id = await get_variant_price(
                item.recipe_id, item.swv_id
            )
        except Exception as e:
            print(f"[Orders] Price resolution failed for recipe={item.recipe_id}: {e}")
            raise HTTPException(
                status_code=422,
                detail="Не удалось подтвердить цену товара",
            )
        try:
            qty = int(item.qty)
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="Некорректное количество товара")
        if qty < 1 or qty > 100:
            raise HTTPException(status_code=422, detail="Некорректное количество товара")
        line_total = unit_price * qty
        server_total += line_total
        resolved_items.append(
            {
                "recipe_id": item.recipe_id,
                "swv_id": resolved_swv_id,
                "title": item.title,
                "price": unit_price,  # authoritative unit price in rubles
                "qty": qty,
            }
        )

    # --- FIX #2: store payload for deferred Posiflora order creation ---
    order_payload_data = {
        "customer_name": payload.customer_name,
        "phone": payload.phone,
        "city": payload.city,
        "street": payload.street,
        "house": payload.house,
        "apartment": payload.apartment,
        "delivery_date": payload.delivery_date,
        "delivery_time": payload.delivery_time,
        "comment": payload.comment,
        "doc_no": doc_no,
        "items": resolved_items,
    }

    # Save to DB — Posiflora order is NOT created here (deferred to payment webhook)
    order = Order(
        posiflora_id=None,
        posiflora_doc_no=doc_no,
        customer_name=payload.customer_name,
        phone=payload.phone,
        address=combined_address,
        comment=payload.comment,
        due_time=local_due_time,
        total_amount=server_total,  # authoritative server-computed total
        status="pending",
        bouquet_ids=json.dumps(resolved_items),  # back-compat: items with server prices
        order_payload=json.dumps(order_payload_data),
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
