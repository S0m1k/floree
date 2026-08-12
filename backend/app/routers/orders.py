import json
import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Order
from app.schemas import OrderCreate, OrderResponse
from app.services.catalog_read import get_recipe_variant_prices
from app.services.deal_sources import SOURCE_SITE, get_or_create_deal_source
from app.services.promo import get_discount_percent, normalize_code

router = APIRouter(prefix="/orders", tags=["orders"])


async def _price_items_server_side(db: AsyncSession, items: list) -> tuple[list[dict], int]:
    """Recompute every line price + the order total from Posiflora.

    The client-supplied `price`/`total_amount` are advisory only and are
    discarded here — the storefront must not be able to set what it pays.
    Fails closed: if a recipe/variant price can't be verified the order is
    rejected rather than trusted at the client's number.
    """
    price_cache: dict[str, dict] = {}
    priced: list[dict] = []
    total = 0

    for item in items:
        if item.recipe_id not in price_cache:
            try:
                price_cache[item.recipe_id] = await get_recipe_variant_prices(
                    db, item.recipe_id
                )
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"Cannot verify price for recipe {item.recipe_id}: {e}",
                )

        info = price_cache[item.recipe_id]
        swv_id = item.swv_id or info["default_swv_id"]
        if swv_id is None or swv_id not in info["prices"]:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown or unpriced variant for recipe {item.recipe_id}",
            )

        unit_price = info["prices"][swv_id]
        qty = max(1, int(item.qty))
        if item.price != unit_price:
            print(
                f"[Pricing] Client price {item.price} != server {unit_price} "
                f"for recipe {item.recipe_id} (swv {swv_id}) — using server price"
            )
        total += unit_price * qty
        priced.append(
            {
                "recipe_id": item.recipe_id,
                "title": item.title,
                "price": unit_price,
                "qty": qty,
                "swv_id": swv_id,
            }
        )

    return priced, total


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

    # 1. Recompute prices server-side from Posiflora (never trust the client).
    #    Fails closed (502/422) if any line price can't be verified.
    items_payload, server_total = await _price_items_server_side(db, payload.items)

    # 1b. Promo code — validated and applied server-side only. An unknown code
    #     is rejected explicitly so the buyer isn't silently charged full price
    #     after the checkout UI promised a discount.
    discount_percent = None
    discount_total = 0
    if payload.promo_code and payload.promo_code.strip():
        discount_percent = await get_discount_percent(db, payload.promo_code)
        if discount_percent is None:
            raise HTTPException(status_code=422, detail="Неизвестный промокод")
        discount_total = int(server_total * discount_percent / 100)  # whole rubles
        server_total -= discount_total

    # 2. Persist a PENDING order only. The Posiflora order is NOT created here —
    #    it is built lazily in the payment webhook once payment is CONFIRMED, so
    #    unpaid orders never reach the florist. The full create args are stashed
    #    in `order_payload` for that deferred step.
    order_payload = {
        "customer_name": payload.customer_name,
        "phone": payload.phone,
        "city": payload.city,
        "street": payload.street,
        "house": payload.house,
        "apartment": payload.apartment,
        "delivery_date": payload.delivery_date,
        "delivery_time": payload.delivery_time,
        "comment": payload.comment,
        "items": items_payload,
        "doc_no": doc_no,
        # Florist-visible note: which promo produced the reduced total.
        "promo_code": normalize_code(payload.promo_code) if discount_percent else None,
        "discount_total": discount_total,
    }

    # Заказ пришёл через витрину — источник сделки «Сайт» проставляется
    # автоматически, как это делает Posiflora для своих каналов.
    site_source = await get_or_create_deal_source(db, SOURCE_SITE)

    order = Order(
        posiflora_id=None,
        posiflora_doc_no=doc_no,
        source_id=site_source.id,
        customer_name=payload.customer_name,
        phone=payload.phone,
        address=combined_address,
        comment=payload.comment,
        due_time=local_due_time,
        total_amount=server_total,
        discount_total=discount_total,
        discount_percent=discount_percent,
        payment_status="pending",
        bouquet_ids=json.dumps(items_payload),
        order_payload=json.dumps(order_payload),
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
