from fastapi import APIRouter, HTTPException, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Order, Payment
from app.schemas import PaymentInitRequest, PaymentInitResponse
import json
from app.services.tbank import init_payment, verify_notification
from app.services.payment_creds import get_tbank_credentials, get_or_create_payment_settings
from app.services import yandex_pay
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

    ps = await get_or_create_payment_settings(db)

    # ─── Yandex Pay ───
    if ps.active_provider == "yandex":
        if not ps.yapay_api_key:
            raise HTTPException(status_code=502, detail="Yandex Pay: не задан API-ключ")
        try:
            ya = await yandex_pay.create_order(
                api_key=ps.yapay_api_key,
                sandbox=bool(ps.yapay_sandbox),
                order_id=order.id,
                amount_rubles=float(order.total_amount),
                title=f"Заказ Floree #{order.posiflora_doc_no or order.id[:8]}",
                success_url=success_url,
                fail_url=fail_url,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Yandex Pay error: {e}")
        payment = Payment(
            order_id=order.id,
            provider="yandex",
            tbank_order_id=order.id,  # generic external order ref
            amount=order.total_amount,
            status="NEW",
            payment_url=ya["payment_url"],
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        return PaymentInitResponse(
            payment_url=ya["payment_url"],
            payment_id=payment.id,
            tbank_payment_id="",
        )

    # ─── T-Bank (default) ───
    terminal_key, secret_key = await get_tbank_credentials(db)
    try:
        tbank_resp = await init_payment(
            order_id=order.id,
            amount_rubles=order.total_amount,
            description=f"Заказ Floree #{order.posiflora_doc_no or order.id[:8]}",
            customer_name=order.customer_name,
            customer_phone=order.phone,
            success_url=success_url,
            fail_url=fail_url,
            terminal_key=terminal_key,
            secret_key=secret_key,
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

    # Verify token (secret may be admin-managed in DB)
    _, secret_key = await get_tbank_credentials(db)
    if not verify_notification(body, secret_key):
        return Response(content="FAIL", status_code=400)

    order_id = body.get("OrderId")
    status = body.get("Status")
    tbank_payment_id = str(body.get("PaymentId", ""))
    amount_kopecks = int(body.get("Amount", 0))
    amount_rubles = amount_kopecks / 100  # exact rubles (may be fractional)

    # Find payment record
    result = await db.execute(
        select(Payment).where(Payment.tbank_order_id == order_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return Response(content="OK")  # unknown order, ignore

    order = None
    if status == "CONFIRMED":
        order_result = await db.execute(
            select(Order).where(Order.id == payment.order_id)
        )
        order = order_result.scalar_one_or_none()

    # Idempotency: a repeated CONFIRMED webhook must not create the order or
    # record the payment twice. Once fulfilled, acknowledge and stop.
    if order is not None and order.payment_status == "paid":
        return Response(content="OK")

    payment.status = status
    payment.tbank_payment_id = tbank_payment_id

    if status == "CONFIRMED" and order is not None:
        # Defense-in-depth: the confirmed amount must match the server-computed
        # total. Compare in kopecks so fractional-ruble totals don't false-flag.
        order_kopecks = int(round(float(order.total_amount) * 100))
        if amount_kopecks != order_kopecks:
            print(
                f"[Payment] Amount mismatch for order {order.id}: "
                f"paid {amount_kopecks}k != total {order_kopecks}k"
            )
            payment.status = "amount_mismatch"
            order.payment_status = "amount_mismatch"
            await db.commit()
            return Response(content="OK")

        # Payment confirmed — the order lives (and is fulfilled) in OUR CRM
        # only. The Posiflora push that used to happen here is gone: florists
        # work the «Заказы» screen in the admin.
        order.payment_status = "paid"

    await db.commit()
    return Response(content="OK")


@router.get("/status/{payment_id}")
async def payment_status(payment_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"status": payment.status, "payment_url": payment.payment_url}


@router.post("/yandex-webhook")
async def yandex_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Yandex Pay event webhook.

    The signed JWT body is used only as a hint: we extract the orderId and then
    re-verify the authoritative status via the Merchant API before marking the
    order paid — so a forged webhook can never confirm anything.
    """
    import base64

    raw = (await request.body()).decode("utf-8", "ignore").strip()
    order_id = None
    try:
        if raw.startswith("{"):
            body = json.loads(raw)
            order_id = body.get("order", {}).get("orderId") or body.get("orderId")
        else:
            # JWT: header.payload.signature — берём payload без проверки подписи
            payload_b64 = raw.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            body = json.loads(base64.urlsafe_b64decode(payload_b64))
            order_id = (body.get("order") or {}).get("orderId") or body.get("orderId")
    except Exception:
        return Response(content="OK")  # мусор игнорируем молча
    if not order_id:
        return Response(content="OK")

    result = await db.execute(select(Payment).where(Payment.tbank_order_id == order_id))
    payment = result.scalar_one_or_none()
    if payment is None or payment.provider != "yandex":
        return Response(content="OK")

    order_row = (
        await db.execute(select(Order).where(Order.id == payment.order_id))
    ).scalar_one_or_none()
    if order_row is None:
        return Response(content="OK")
    if order_row.payment_status == "paid":
        return Response(content="OK")  # idempotent

    ps = await get_or_create_payment_settings(db)
    if not ps.yapay_api_key:
        return Response(content="OK")
    try:
        status_info = await yandex_pay.get_order_status(
            api_key=ps.yapay_api_key,
            sandbox=bool(ps.yapay_sandbox),
            order_id=order_id,
        )
    except Exception as e:
        print(f"[YandexPay] status check failed: {e}")
        return Response(content="OK")

    if not status_info["paid"]:
        payment.status = status_info.get("payment_status") or "PENDING"
        await db.commit()
        return Response(content="OK")

    # Сверка суммы (как в тбанк-вебхуке): оплачено должно равняться серверному итогу
    amount = status_info.get("amount_rubles")
    if amount is not None:
        order_kopecks = int(round(float(order_row.total_amount) * 100))
        if int(round(amount * 100)) != order_kopecks:
            print(f"[YandexPay] Amount mismatch for order {order_row.id}")
            payment.status = "amount_mismatch"
            order_row.payment_status = "amount_mismatch"
            await db.commit()
            return Response(content="OK")

    payment.status = "CONFIRMED"
    order_row.payment_status = "paid"
    await db.commit()
    return Response(content="OK")
