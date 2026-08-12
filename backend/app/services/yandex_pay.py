"""Yandex Pay (Merchant API) integration.

Flow: create an order → redirect the buyer to `paymentUrl`; Yandex calls our
webhook on status changes, and we re-verify the status via the Merchant API
before marking anything paid (the webhook body is treated as a hint only, so
we never need to validate its JWT signature ourselves).

API docs: https://pay.yandex.ru/docs/ru/custom/backend/merchant-api/
"""

import httpx

from app.services.tls import outbound_ssl_context

PROD_BASE = "https://pay.yandex.ru"
SANDBOX_BASE = "https://sandbox.pay.yandex.ru"


def _base(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else PROD_BASE


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"}


class YandexPayError(Exception):
    pass


async def create_order(
    *,
    api_key: str,
    sandbox: bool,
    order_id: str,
    amount_rubles: float,
    title: str,
    success_url: str,
    fail_url: str,
    ttl_seconds: int = 1800,
) -> dict:
    """Create a payment order; returns {"payment_url": ...}."""
    amount = f"{amount_rubles:.2f}"
    body = {
        "orderId": order_id,
        "currencyCode": "RUB",
        "availablePaymentMethods": ["CARD", "SPLIT"],
        "ttl": ttl_seconds,
        "redirectUrls": {"onSuccess": success_url, "onError": fail_url},
        "cart": {
            "externalId": order_id,
            "items": [
                {
                    "productId": order_id,
                    "title": title,
                    "quantity": {"count": "1"},
                    "total": amount,
                }
            ],
            "total": {"amount": amount},
        },
    }
    async with httpx.AsyncClient(timeout=30, verify=outbound_ssl_context()) as client:
        resp = await client.post(
            f"{_base(sandbox)}/api/merchant/v1/orders",
            json=body,
            headers=_headers(api_key),
        )
    data = resp.json() if resp.content else {}
    if resp.status_code != 200 or data.get("status") != "success":
        raise YandexPayError(f"Yandex Pay create failed {resp.status_code}: {resp.text[:300]}")
    payment_url = (data.get("data") or {}).get("paymentUrl")
    if not payment_url:
        raise YandexPayError(f"Yandex Pay: нет paymentUrl в ответе: {resp.text[:300]}")
    return {"payment_url": payment_url}


async def get_order_status(*, api_key: str, sandbox: bool, order_id: str) -> dict:
    """Authoritative order state: {"paid": bool, "amount_rubles": float | None}."""
    async with httpx.AsyncClient(timeout=30, verify=outbound_ssl_context()) as client:
        resp = await client.get(
            f"{_base(sandbox)}/api/merchant/v1/orders/{order_id}",
            headers=_headers(api_key),
        )
    data = resp.json() if resp.content else {}
    if resp.status_code != 200 or data.get("status") != "success":
        raise YandexPayError(f"Yandex Pay status failed {resp.status_code}: {resp.text[:300]}")
    order = (data.get("data") or {}).get("order") or {}
    payment_status = order.get("paymentStatus")
    cart_total = ((order.get("cart") or {}).get("total") or {}).get("amount")
    return {
        "paid": payment_status in ("CAPTURED", "PAID", "CONFIRMED"),
        "payment_status": payment_status,
        "amount_rubles": float(cart_total) if cart_total is not None else None,
    }
