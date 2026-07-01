"""Phase 3 — pure transforms: Posiflora JSON:API resource -> our model kwargs.

Kept side-effect free so they can be unit-tested against captured payloads
without a network or DB. The import runner (posiflora_import.py) fetches the
data and upserts the results.
"""

from datetime import datetime
from decimal import Decimal


def _attrs(raw: dict) -> dict:
    return raw.get("attributes") or {}


def _rel_id(raw: dict, name: str) -> str | None:
    data = ((raw.get("relationships") or {}).get(name) or {}).get("data")
    if not data:
        return None
    if isinstance(data, list):
        return data[0]["id"] if data else None
    return data.get("id")


def _status_from_deleted(a: dict) -> str:
    return "off" if a.get("deleted") else a.get("status", "on")


# ---------- simple entities ----------

def map_image(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "hash": a.get("hash"),
        "file": a.get("file"),
        "file_small": a.get("fileSmall"),
        "file_medium": a.get("fileMedium"),
        "file_shop": a.get("fileShop"),
    }


def map_store(raw: dict) -> dict:
    a = _attrs(raw)
    return {"id": raw["id"], "title": a.get("title") or "", "address": a.get("address")}


def map_category(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or "",
        "color": a.get("color"),
        "status": a.get("status", "on"),
        "deleted": bool(a.get("deleted")),
        "group_id": _rel_id(raw, "group"),
        "parent_id": _rel_id(raw, "parent"),
    }


def map_item(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or "",
        "item_type": a.get("itemType", "item"),
        "global_id": a.get("globalId"),
        "min_price": a.get("priceMin") or 0,
        "max_price": a.get("priceMax") or 0,
        "public": bool(a.get("public")),
        "fractional": bool(a.get("fractional")),
        "status": _status_from_deleted(a),
        "category_id": _rel_id(raw, "category"),
        "unit_id": _rel_id(raw, "measure"),
        "logo_id": _rel_id(raw, "logo"),
    }


def map_measure(raw: dict) -> dict:
    """`measures` come only via includes (no collection endpoint)."""
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or a.get("name") or "",
        "short_name": a.get("shortName") or a.get("short"),
    }


def map_vendor(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or "",
        "phone": a.get("phone"),
        "email": a.get("email"),
        "comment": a.get("description"),
    }


def _date_only(v: str | None) -> str | None:
    if not v:
        return None
    return v[:10]  # 'YYYY-MM-DD...' -> date


def map_customer(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "name": a.get("title"),
        "email": a.get("email") or None,
        "gender": a.get("gender"),
        "phone": a.get("phone") or "",
        "birthday": _date_only(a.get("birthday")),
        "bonus_balance": int(a.get("currentPoints") or 0),
        "comment": a.get("notes") or None,
    }


# ---------- recipe graph (spec-driven) ----------

def map_specification(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or "",
        "description": a.get("description") or None,
        "status": a.get("status", "on"),
        "public": bool(a.get("public")),
        "min_price": a.get("minPrice") or 0,
        "max_price": a.get("maxPrice") or 0,
        "video_url": a.get("videoUrl"),
        "category_id": _rel_id(raw, "category"),
        "logo_id": _rel_id(raw, "logo"),
    }


def parse_spec_graph(detail: dict) -> dict:
    """From a specification detail (include=logo,images,specVariants,
    specVariants.variant,specVariants.specVariantPrices) produce upsertable
    rows for images, variants, spec-with-variants and prices.

    The collection endpoint for SWV exposes neither the parent specification
    nor prices, so this graph must be derived from the spec's own includes.
    """
    spec = detail["data"]
    spec_id = spec["id"]
    included = detail.get("included") or []

    images, variants, swvs, prices = [], [], [], []
    for inc in included:
        t = inc.get("type")
        if t == "images":
            images.append(map_image(inc))
        elif t == "specification-variants":
            va = _attrs(inc)
            variants.append({"id": inc["id"], "title": va.get("title") or ""})
        elif t == "specification-with-variants":
            sa = _attrs(inc)
            swvs.append({
                "id": inc["id"],
                "specification_id": spec_id,
                "variant_id": _rel_id(inc, "variant"),
                "is_default": bool(sa.get("isDefault")),
                "status": sa.get("status", "on"),
            })
        elif t == "specification-variant-prices":
            pa = _attrs(inc)
            prices.append({
                "id": inc["id"],
                "spec_with_variants_id": _rel_id(inc, "specVariants"),
                "price_value": int(pa.get("priceValue") or 0),
                "status": pa.get("status", "on"),
            })

    return {"spec": map_specification(spec), "images": images,
            "variants": variants, "swvs": swvs, "prices": prices}


# ---------- transactional entities ----------
# Transactional money columns are Numeric(12,2); keep the fractional rubles
# Posiflora sends (e.g. 5142.5) exactly via Decimal.

def _money(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def map_bouquet(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "title": a.get("title") or "",
        "status": a.get("status", "created"),
        "amount": _money(a.get("amount")),
        "sale_amount": _money(a.get("saleAmount")),
        "store_id": _rel_id(raw, "store"),
        "spec_with_variants_id": _rel_id(raw, "specWithVar"),
    }


def _order_address(a: dict) -> str:
    parts = [
        a.get("deliveryCity"),
        ", ".join(p for p in [a.get("deliveryStreet"), a.get("deliveryHouse")] if p),
    ]
    apt = a.get("deliveryApartment")
    if apt:
        parts.append(f"кв. {apt}")
    return ", ".join(p for p in parts if p)


def map_order(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"],
        "posiflora_id": raw["id"],
        "posiflora_doc_no": a.get("docNo"),
        "customer_name": a.get("deliveryContact") or "",
        "phone": a.get("deliveryPhoneNumber") or "",
        "address": _order_address(a),
        "comment": a.get("description") or None,
        "due_time": a.get("dueTime"),
        "total_amount": _money(a.get("totalAmount")),
        "status": a.get("status", "imported"),
        "bouquet_ids": "[]",  # order<->bouquet linkage not exposed on read
    }


def map_order_payment(raw: dict) -> dict:
    a = _attrs(raw)
    order_id = _rel_id(raw, "order")
    return {
        "id": raw["id"],
        "order_id": order_id,
        "tbank_order_id": order_id or "",
        "tbank_payment_id": a.get("terminalTransactionId"),
        "amount": _money(a.get("amount")),
        "status": "CONFIRMED" if a.get("posted") else "INIT",
        "payment_url": a.get("paymentLink"),
    }
