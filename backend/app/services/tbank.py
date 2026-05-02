import hashlib
import httpx
from app.config import settings


def _generate_token(params: dict) -> str:
    """
    T-Bank token: sort all params (excl. Token, Receipt, DATA) by key,
    concatenate values + SecretKey (as Password), SHA-256.
    Correct algorithm: add Password=SecretKey as a param, sort all by key, concat values.
    """
    excluded = {"Token", "Receipt", "DATA"}
    combined = {k: str(v) for k, v in params.items() if k not in excluded}
    combined["Password"] = settings.tbank_secret_key
    sorted_vals = "".join(v for _, v in sorted(combined.items()))
    return hashlib.sha256(sorted_vals.encode()).hexdigest()


async def init_payment(
    order_id: str,
    amount_rubles: int,
    description: str,
    customer_name: str,
    customer_phone: str,
    success_url: str,
    fail_url: str,
) -> dict:
    """
    Initialize T-Bank payment. Returns PaymentId and PaymentURL.
    Amount is sent in KOPECKS (rubles * 100).
    """
    amount_kopecks = amount_rubles * 100
    params = {
        "TerminalKey": settings.tbank_terminal_key,
        "Amount": amount_kopecks,
        "OrderId": order_id,
        "Description": description[:140],  # max 140 chars
        "SuccessURL": success_url,
        "FailURL": fail_url,
    }
    params["Token"] = _generate_token(params)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{settings.tbank_api_url}/Init", json=params)
        resp.raise_for_status()
        data = resp.json()

    if not data.get("Success"):
        raise Exception(f"T-Bank Init failed: {data.get('Message')} / {data.get('Details')}")

    return {
        "payment_id": data["PaymentId"],
        "payment_url": data["PaymentURL"],
        "status": data["Status"],
    }


def verify_notification(params: dict) -> bool:
    """Verify webhook notification token from T-Bank."""
    received_token = params.get("Token", "")
    expected = _generate_token(params)
    return received_token == expected
