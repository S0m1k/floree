import asyncio
import httpx
from app.services.tls import outbound_ssl_context
import time
import uuid
from app.config import settings

_token_cache: dict = {"access_token": None, "expires_at": 0}

# Runtime credential override (set from the admin-managed posiflora_settings
# row before an import run). None -> fall back to the .env settings, keeping
# the historical single-tenant flow intact.
_creds: dict | None = None


def set_credentials(base_url: str, username: str, password: str) -> None:
    """Point the client at a specific Posiflora account (admin import flow)."""
    global _creds
    _creds = {
        "base_url": base_url.rstrip("/"),
        "username": username,
        "password": password,
    }
    _token_cache["access_token"] = None
    _token_cache["expires_at"] = 0


def _base_url() -> str:
    return _creds["base_url"] if _creds else settings.posiflora_base_url


def _username() -> str:
    return _creds["username"] if _creds else settings.posiflora_username


def _password() -> str:
    return _creds["password"] if _creds else settings.posiflora_password

# Posiflora inventory-group id for "Рецепты" (specifications)
RECIPES_GROUP_ID = "9"

# Shared client so a long run (the ETL makes hundreds of paginated calls) reuses
# one TLS connection instead of re-handshaking per request — the per-request
# client this used to open exhausted the remote and surfaced as ConnectTimeout
# a few dozen requests in.
_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()

# Transient network faults are retried with backoff; everything else propagates.
_RETRY_EXCEPTIONS = (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError)
_MAX_ATTEMPTS = 4


async def _get_client() -> httpx.AsyncClient:
    global _client
    async with _client_lock:
        if _client is None or _client.is_closed:
            _client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=30.0),
                limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
                verify=outbound_ssl_context(),
            )
        return _client


async def close_client() -> None:
    """Release the shared client (call at the end of a standalone script)."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def _get_token() -> str:
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    client = await _get_client()
    resp = await _with_retry(
        client.post,
        f"{_base_url()}/v1/sessions",
        headers={"Content-Type": "application/vnd.api+json"},
        json={
            "data": {
                "type": "sessions",
                "attributes": {
                    "username": _username(),
                    "password": _password(),
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


async def _with_retry(fn, *args, **kwargs):
    """Call `fn`, retrying transient network faults with exponential backoff."""
    delay = 1.0
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await fn(*args, **kwargs)
        except _RETRY_EXCEPTIONS:
            if attempt == _MAX_ATTEMPTS:
                raise
            await asyncio.sleep(delay)
            delay *= 2


async def posiflora_request(method: str, path: str, **kwargs):
    token = await _get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
    }
    client = await _get_client()
    resp = await _with_retry(
        client.request,
        method,
        f"{_base_url()}{path}",
        headers=headers,
        **kwargs,
    )
    if not resp.is_success:
        raise Exception(f"Posiflora error {resp.status_code}: {resp.text}")
    return resp.json()


# ---------- Recipes (Posiflora specifications) ----------

def _attach_image_url(item: dict, image_map: dict) -> dict:
    """Inject imageUrl from logo relationship; keep images[] resolved if present."""
    rels = item.get("relationships") or {}
    logo_rel = (rels.get("logo") or {}).get("data")
    logo = image_map.get(logo_rel["id"]) if logo_rel else None
    image_url = None
    if logo:
        image_url = logo["attributes"].get("fileShop") or logo["attributes"].get("file")

    image_urls: list[str] = []
    images_rel = (rels.get("images") or {}).get("data") or []
    for ref in images_rel:
        img = image_map.get(ref["id"])
        if img:
            url = img["attributes"].get("fileShop") or img["attributes"].get("file")
            if url:
                image_urls.append(url)
    # Fall back to logo as first image if images[] empty
    if not image_urls and image_url:
        image_urls = [image_url]

    return {**item, "imageUrl": image_url, "imageUrls": image_urls}


async def get_recipes(category_id: str | None = None) -> dict:
    """Fetch ALL active+public recipes across pages.

    Optionally filtered by category. Returns a JSON:API-shaped response with
    each item carrying a top-level `imageUrl` for convenience.
    """
    all_items: list = []
    image_map: dict = {}
    page = 1

    # Build query — keep status=on filter, paginate at 200/page.
    # NOTE: Posiflora ignores filter[category] on /v1/specifications (it returns
    # every recipe regardless), so category filtering is done client-side below
    # via each recipe's category relationship.
    base_qs = "include=logo&filter%5Bstatus%5D=on&page%5Bsize%5D=200"

    while True:
        data = await posiflora_request(
            "GET", f"/v1/specifications?{base_qs}&page%5Bnumber%5D={page}"
        )
        items = data.get("data") or []
        all_items.extend(items)

        for inc in data.get("included") or []:
            if inc.get("type") == "images":
                image_map[inc["id"]] = inc

        total = (data.get("meta") or {}).get("total", 0)
        if page * 200 >= total or not items:
            break
        page += 1

    result = []
    for r in all_items:
        attrs = r.get("attributes", {})
        # Only public, non-deleted recipes that have a price
        if not attrs.get("public"):
            continue
        if attrs.get("status") != "on":
            continue
        # Posiflora does not honor filter[category]; filter by the recipe's own
        # category relationship so a category page shows only its own items.
        if category_id:
            cat = ((r.get("relationships") or {}).get("category") or {}).get("data")
            if not cat or cat.get("id") != category_id:
                continue
        result.append(_attach_image_url(r, image_map))

    # Sort by updatedAt descending (newest first)
    result.sort(key=lambda r: r["attributes"].get("updatedAt") or "", reverse=True)
    return {"data": result, "meta": {"total": len(result)}}


def _parse_qty(title: str | None) -> int | None:
    """Extract the leading integer from a variant title like '9 штук' -> 9."""
    if not title:
        return None
    import re
    m = re.search(r"\d+", title)
    return int(m.group()) if m else None


def _parse_variants(included: list[dict]) -> list[dict]:
    """Build the list of priced quantity-variants for a recipe.

    Posiflora exposes per-variant prices only via the
    specVariants.specVariantPrices include. Each `specification-variant-prices`
    object carries `priceValue` (the sale price the owner set) and links to a
    `specification-with-variants` (SWV); the SWV links to a
    `specification-variants` whose title is the quantity label ('7 штук').
    """
    swv_to_variant: dict[str, str] = {}
    swv_attrs: dict[str, dict] = {}
    variant_title: dict[str, str] = {}
    price_objs: list[dict] = []
    for inc in included:
        t = inc.get("type")
        if t == "specification-with-variants":
            swv_attrs[inc["id"]] = inc.get("attributes", {})
            v = ((inc.get("relationships") or {}).get("variant") or {}).get("data")
            if v:
                swv_to_variant[inc["id"]] = v["id"]
        elif t == "specification-variants":
            variant_title[inc["id"]] = inc.get("attributes", {}).get("title")
        elif t == "specification-variant-prices":
            price_objs.append(inc)

    variants: list[dict] = []
    for p in price_objs:
        if p.get("attributes", {}).get("status") != "on":
            continue
        swv_ref = ((p.get("relationships") or {}).get("specVariants") or {}).get("data")
        if not swv_ref:
            continue
        swv_id = swv_ref["id"]
        if swv_attrs.get(swv_id, {}).get("status") not in (None, "on"):
            continue
        title = variant_title.get(swv_to_variant.get(swv_id, ""))
        variants.append({
            "swvId": swv_id,
            "title": title,
            "qty": _parse_qty(title),
            "price": p["attributes"].get("priceValue"),
            "isDefault": bool(swv_attrs.get(swv_id, {}).get("isDefault")),
        })

    variants.sort(key=lambda v: (v["qty"] is None, v["qty"] or 0, v["price"] or 0))
    return variants


async def get_recipe(recipe_id: str) -> dict:
    data = await posiflora_request(
        "GET",
        f"/v1/specifications/{recipe_id}"
        "?include=logo,images,tags,category,"
        "specVariants,specVariants.variant,specVariants.specVariantPrices"
        "&filter%5BactiveVariants%5D=true",
    )
    image_map = {
        img["id"]: img
        for img in (data.get("included") or [])
        if img.get("type") == "images"
    }
    # Also surface included tags/category so the frontend can render names
    included_index: dict = {}
    for inc in data.get("included") or []:
        included_index.setdefault(inc["type"], {})[inc["id"]] = inc

    item = _attach_image_url(data["data"], image_map)
    item["included"] = included_index
    item["variants"] = _parse_variants(data.get("included") or [])
    return item


async def get_recipe_variant_prices(recipe_id: str) -> dict:
    """Authoritative pricing for a recipe, straight from Posiflora.

    Returns {"prices": {swvId: price_rubles}, "default_swv_id": swvId | None}.
    Source of truth is `specification-variant-prices.priceValue` — never the
    price a client sends. Used to recompute order totals server-side so the
    public storefront cannot dictate what it pays.
    """
    data = await posiflora_request(
        "GET",
        f"/v1/specifications/{recipe_id}"
        "?include=specVariants,specVariants.variant,specVariants.specVariantPrices"
        "&filter%5BactiveVariants%5D=true",
    )
    variants = _parse_variants(data.get("included") or [])
    prices = {
        v["swvId"]: int(v["price"])
        for v in variants
        if v.get("swvId") and v.get("price") is not None
    }
    default_swv_id = next((v["swvId"] for v in variants if v.get("isDefault")), None)
    if default_swv_id is None and variants:
        default_swv_id = variants[0]["swvId"]
    return {"prices": prices, "default_swv_id": default_swv_id}


_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(title: str) -> str:
    """Transliterate a Russian category title into a URL slug.

    Posiflora categories have no slug, so the storefront derives clean,
    stable `/catalog/<slug>` URLs from the title.
    """
    import re

    out = []
    for ch in (title or "").strip().lower():
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum():  # keep latin letters/digits
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug or "category"


async def get_recipe_categories() -> dict:
    """User-defined recipe categories (children of the "Рецепты" root).

    Each category is enriched with a unique `slug` (derived from the title)
    so the storefront can serve SEO-friendly `/catalog/<slug>` pages.
    """
    data = await posiflora_request(
        "GET", f"/v1/categories?filter%5Bgroup%5D={RECIPES_GROUP_ID}"
    )
    items = data.get("data") or []
    result = []
    seen_slugs: dict[str, int] = {}
    for c in items:
        attrs = c.get("attributes", {})
        if attrs.get("deleted"):
            continue
        if attrs.get("status") != "on":
            continue
        # Root "Рецепты" category has no parent and is the group placeholder — skip it
        parent = (c.get("relationships") or {}).get("parent", {}).get("data")
        if parent is None and (attrs.get("title") or "").strip().lower() == "рецепты":
            continue
        base = slugify(attrs.get("title", ""))
        n = seen_slugs.get(base, 0)
        seen_slugs[base] = n + 1
        attrs["slug"] = base if n == 0 else f"{base}-{n + 1}"
        result.append(c)
    return {"data": result, "meta": {"total": len(result)}}


# ---------- Price resolution ----------

async def get_variant_price(recipe_id: str, swv_id: str | None) -> tuple[int, str]:
    """Return (authoritative_price_rubles, resolved_swv_id) for a recipe variant.

    Resolution order:
      1. If swv_id is provided, match the variant whose swvId == swv_id.
      2. Else pick the variant flagged isDefault=True.
      3. Else pick the first variant in the sorted list.

    Raises Exception if the recipe cannot be fetched, no variants exist,
    the requested swv_id is not found, or the resolved variant has no price.
    """
    item = await get_recipe(recipe_id)
    variants: list[dict] = item.get("variants") or []

    if not variants:
        raise Exception(f"No active variants found for recipe {recipe_id}")

    if swv_id:
        match = next((v for v in variants if v.get("swvId") == swv_id), None)
        if match is None:
            raise Exception(
                f"Variant swv_id={swv_id} not found for recipe {recipe_id}"
            )
        resolved = match
    else:
        default = next((v for v in variants if v.get("isDefault")), None)
        resolved = default if default is not None else variants[0]

    price = resolved.get("price")
    if price is None:
        raise Exception(
            f"Variant swv_id={resolved.get('swvId')} of recipe {recipe_id} has no price"
        )

    return int(price), resolved["swvId"]


# ---------- Orders ----------

async def _get_swv_id_for_recipe(recipe_id: str) -> str:
    """Find the specification-with-variants id used to attach a recipe to a bouquet.

    Posiflora bouquets reference 'specification-with-variants' (not specifications
    directly). Each recipe has at least one SWV; we pick the first active one,
    preferring isDefault=true.
    """
    data = await posiflora_request(
        "GET",
        f"/v1/specification-with-variants?filter%5Bspecification%5D={recipe_id}",
    )
    items = [i for i in (data.get("data") or []) if i.get("attributes", {}).get("status") == "on"]
    if not items:
        raise Exception(f"No active specification-with-variants for recipe {recipe_id}")
    items.sort(key=lambda i: 0 if i["attributes"].get("isDefault") else 1)
    return items[0]["id"]


async def _create_bouquet_from_recipe(
    recipe_id: str, title: str, price: int, swv_id: str | None = None
) -> str:
    """Create a single bouquet attached to a recipe. Returns new bouquet id.

    If `swv_id` (a chosen quantity-variant) is given it is used directly;
    otherwise we fall back to the recipe's default specification-with-variants.
    """
    if not swv_id:
        swv_id = await _get_swv_id_for_recipe(recipe_id)
    bouquet_id = str(uuid.uuid4())
    await posiflora_request(
        "POST",
        "/v1/bouquets",
        json={
            "data": {
                "type": "bouquets",
                "id": bouquet_id,
                "attributes": {
                    "status": "created",
                    "title": title,
                    "amount": price,
                    "saleAmount": price,
                },
                "relationships": {
                    "store": {
                        "data": {"type": "stores", "id": settings.posiflora_store_id}
                    },
                    "specWithVar": {
                        "data": {
                            "type": "specification-with-variants",
                            "id": swv_id,
                        }
                    },
                },
            }
        },
    )
    return bouquet_id


async def _delete_bouquet(bouquet_id: str) -> None:
    """Best-effort cleanup of a bouquet (used to roll back partial order creation)."""
    try:
        await posiflora_request(
            "DELETE",
            f"/v1/bouquets/{bouquet_id}",
            json={"data": {"type": "bouquets", "id": bouquet_id}},
        )
    except Exception as e:
        print(f"[Posiflora] Failed to roll back bouquet {bouquet_id}: {e}")


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
    items: list[dict],
    doc_no: str,
) -> dict:
    """Create order in Posiflora.

    `items` is a list of {recipe_id, title, price, qty}. For each item we
    create `qty` bouquets attached to the recipe's specification-with-variants,
    then attach all bouquet ids to a new order. On any failure mid-way we roll
    back the bouquets that were already created.
    """
    from datetime import date
    today = date.today().isoformat()
    phone_code, phone_number = _split_phone(phone)

    created_bouquet_ids: list[str] = []
    try:
        for item in items:
            for _ in range(int(item.get("qty", 1))):
                bid = await _create_bouquet_from_recipe(
                    recipe_id=item["recipe_id"],
                    title=item["title"],
                    price=int(item["price"]),
                    swv_id=item.get("swv_id"),
                )
                created_bouquet_ids.append(bid)
    except Exception as e:
        for bid in created_bouquet_ids:
            await _delete_bouquet(bid)
        raise Exception(f"Failed to create bouquets for order: {e}")

    relationships: dict = {
        "store": {"data": {"type": "stores", "id": settings.posiflora_store_id}},
        "source": {"data": {"type": "order-sources", "id": settings.posiflora_source_id}},
    }
    if created_bouquet_ids:
        relationships["bouquets"] = {
            "data": [{"type": "bouquets", "id": bid} for bid in created_bouquet_ids]
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

    try:
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
    except Exception as e:
        # Order creation failed — roll back the bouquets we just made
        for bid in created_bouquet_ids:
            await _delete_bouquet(bid)
        raise Exception(f"Failed to create order, bouquets rolled back: {e}")


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
