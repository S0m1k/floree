from fastapi import APIRouter, HTTPException, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Order, Payment
from app.schemas import PaymentInitRequest, PaymentInitResponse
from app.services.tbank import init_payment, verify_notification
from app.services.posiflora import record_payment
from app.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/init", response_model=PaymentInitResponse)
async def init_payment_route(
    payload: PaymentInitRequest, db: AsyncSession = Depends(get_db)
):
    # Load order
    result = await db.execute(select(Order).where(Order.id == payload.order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    success_url = f"{settings.frontend_url}/checkout/success?order={order.id}"
    fail_url = f"{settings.frontend_url}/checkout/fail?order={order.id}"

    try:
        tbank_resp = await init_payment(
            order_id=order.id,
            amount_rubles=order.total_amount,
            description=f"Заказ Floree #{order.posiflora_doc_no or order.id[:8]}",
            customer_name=order.customer_name,
            customer_phone=order.phone,
            success_url=success_url,
            fail_url=fail_url,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"T-Bank error: {e}")

    # Save payment record
    payment = Payment(
        order_id=order.id,
        tbank_payment_id=str(tbank_resp["payment_id"]),
        tbank_order_id=order.id,
        amount=order.total_amount,
        status=tbank_resp["status"],
        payment_url=tbank_resp["payment_url"],
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentInitResponse(
        payment_url=tbank_resp["payment_url"],
        payment_id=payment.id,
        tbank_payment_id=str(tbank_resp["payment_id"]),
    )


@router.post("/webhook")
async def tbank_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """T-Bank sends POST with form data or JSON."""
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)

    # Verify token
    if not verify_notification(body):
        return Response(content="FAIL", status_code=400)

    order_id = body.get("OrderId")
    status = body.get("Status")
    tbank_payment_id = str(body.get("PaymentId", ""))
    amount_kopecks = int(body.get("Amount", 0))
    amount_rubles = amount_kopecks // 100

    # Find payment record
    result = await db.execute(
        select(Payment).where(Payment.tbank_order_id == order_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return Response(content="OK")  # unknown order, ignore

    # Update payment status
    payment.status = status
    payment.tbank_payment_id = tbank_payment_id

    if status == "CONFIRMED":
        # Update order status
        order_result = await db.execute(
            select(Order).where(Order.id == payment.order_id)
        )
        order = order_result.scalar_one_or_none()
        if order:
            order.status = "paid"
            # Record payment in Posiflora
            if order.posiflora_id:
                try:
                    await record_payment(order.posiflora_id, amount_rubles)
                except Exception as e:
                    print(f"[Posiflora] Record payment failed: {e}")

    await db.commit()
    return Response(content="OK")


@router.get("/status/{payment_id}")
async def payment_status(payment_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"status": payment.status, "payment_url": payment.payment_url}
