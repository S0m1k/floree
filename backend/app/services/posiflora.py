import httpx
import time
from app.config import settings

_token_cache: dict = {"access_token": None, "expires_at": 0}


async def _get_token() -> str:
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.posiflora_base_url}/v1/sessions",
            headers={"Content-Type": "application/vnd.api+json"},
            json={
                "data": {
                    "type": "sessions",
                    "attributes": {
                        "username": settings.posiflora_username,
                        "password": settings.posiflora_password,
                    },
                }
            },
        )
        resp.raise_for_status()
        data = resp.json()
        attrs = data["data"]["attributes"]
        _token_cache["access_token"] = attrs["accessToken"]
        # Cache until 1 min before expiry
        from datetime import datetime
        expire_dt = datetime.fromisoformat(attrs["expireAt"])
        _token_cache["expires_at"] = expire_dt.timestamp() - 60
        return _token_cache["access_token"]


async def posiflora_request(method: str, path: str, **kwargs):
    token = await _get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(
            method,
            f"{settings.posiflora_base_url}{path}",
            headers=headers,
            **kwargs,
        )
        if not resp.is_success:
            raise Exception(f"Posiflora error {resp.status_code}: {resp.text}")
        return resp.json()


async def get_bouquets() -> dict:
    """Fetch all bouquets with logos, filter to demonstrated ones."""
    data = await posiflora_request("GET", "/v1/bouquets?include=logo&page%5Bsize%5D=200")

    image_map = {
        img["id"]: img
        for img in (data.get("included") or [])
        if img.get("type") == "images"
    }

    result = []
    for b in data.get("data", []):
        attrs = b.get("attributes", {})
        if attrs.get("status") != "demonstrated" or not attrs.get("onWindowAt"):
            continue
        logo_rel = b.get("relationships", {}).get("logo", {}).get("data")
        image = image_map.get(logo_rel["id"]) if logo_rel else None
        result.append({
            **b,
            "imageUrl": (
                image["attributes"].get("fileShop") or image["attributes"].get("file")
                if image else None
            ),
        })

    return {"data": result, "meta": data.get("meta", {})}


async def get_bouquet(bouquet_id: str) -> dict:
    data = await posiflora_request("GET", f"/v1/bouquets/{bouquet_id}?include=logo")
    image_map = {
        img["id"]: img
        for img in (data.get("included") or [])
        if img.get("type") == "images"
    }
    b = data["data"]
    logo_rel = b.get("relationships", {}).get("logo", {}).get("data")
    image = image_map.get(logo_rel["id"]) if logo_rel else None
    return {
        **b,
        "imageUrl": (
            image["attributes"].get("fileShop") or image["attributes"].get("file")
            if image else None
        ),
    }


def _split_phone(phone: str) -> tuple[str, str]:
    """Split a Russian phone into (code, number) for Posiflora.

    Posiflora's deliveryPhoneCode is the country code like '+7' and
    deliveryPhoneNumber is the 10-digit national number. Sending the
    full 11-digit number into deliveryPhoneNumber alone makes Posiflora
    treat the leading digit as something else and display '+0 (...)'.
    """
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+7", digits[1:]
    # Fallback — best effort, last 10 digits as number, rest as code
    if len(digits) > 10:
        return "+" + digits[:-10], digits[-10:]
    return "+7", digits


def _build_delivery_window(delivery_date: str, delivery_time: str) -> tuple[str, str]:
    """Build ISO date-time pair for 30-min delivery slot in Moscow time."""
    from datetime import datetime, timedelta, timezone
    msk = timezone(timedelta(hours=3))
    start = datetime.fromisoformat(f"{delivery_date}T{delivery_time}:00").replace(tzinfo=msk)
    end = start + timedelta(minutes=30)
    return start.isoformat(), end.isoformat()


async def create_order(
    customer_name: str,
    phone: str,
    city: str,
    street: str,
    house: str,
    apartment: str | None,
    delivery_date: str | None,
    delivery_time: str | None,
    comment: str | None,
    bouquet_ids: list[str],
    doc_no: str,
) -> dict:
    """Create order in Posiflora with structured delivery fields."""
    from datetime import date
    today = date.today().isoformat()
    phone_code, phone_number = _split_phone(phone)

    relationships: dict = {
        "store": {"data": {"type": "stores", "id": settings.posiflora_store_id}},
        "source": {"data": {"type": "order-sources", "id": settings.posiflora_source_id}},
    }
    if bouquet_ids:
        relationships["bouquets"] = {
            "data": [{"type": "bouquets", "id": bid} for bid in bouquet_ids]
        }

    attributes: dict = {
        "status": "new",
        "date": today,
        "docNo": doc_no,
        "delivery": True,
        "deliveryContact": customer_name,
        "deliveryPhoneCode": phone_code,
        "deliveryPhoneNumber": phone_number,
        "deliveryCity": city,
        "deliveryStreet": street,
        "deliveryHouse": house,
    }
    if apartment:
        attributes["deliveryApartment"] = apartment
    if comment:
        attributes["deliveryComments"] = comment
    if delivery_date and delivery_time:
        time_from, time_to = _build_delivery_window(delivery_date, delivery_time)
        attributes["deliveryTimeFrom"] = time_from
        attributes["deliveryTimeTo"] = time_to
        attributes["dueTime"] = time_from

    return await posiflora_request(
        "POST",
        "/v1/orders",
        json={
            "data": {
                "type": "orders",
                "attributes": attributes,
                "relationships": relationships,
            }
        },
    )


async def record_payment(posiflora_order_id: str, amount: int) -> dict:
    """Record a confirmed payment in Posiflora."""
    from datetime import date
    return await posiflora_request(
        "POST",
        f"/v1/orders/{posiflora_order_id}/payments",
        json={
            "data": {
                "type": "payments",
                "attributes": {
                    "paymentType": "payment",
                    "date": date.today().isoformat(),
                    "amount": amount,
                    "posted": True,
                },
            }
        },
    )
