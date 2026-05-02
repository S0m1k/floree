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


async def create_order(
    customer_name: str,
    phone: str,
    address: str,
    comment: str | None,
    due_time: str | None,
    bouquet_ids: list[str],
    doc_no: str,
) -> dict:
    """Create order in Posiflora."""
    from datetime import date
    today = date.today().isoformat()
    # Strip non-digits from phone
    phone_digits = "".join(c for c in phone if c.isdigit())

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
        "deliveryPhoneNumber": phone_digits,
        "deliveryComments": f"{address}" + (f" — {comment}" if comment else ""),
    }
    if due_time:
        attributes["dueTime"] = due_time

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
