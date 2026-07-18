"""Phase 3 — pure transforms: Posiflora JSON:API resource -> our model kwargs.

Kept side-effect free so they can be unit-tested against captured payloads
without a network or DB. The import runner (posiflora_import.py) fetches the
data and upserts the results.
"""

import json
import logging
import re
from datetime import datetime, date
from decimal import Decimal

logger = logging.getLogger(__name__)


def _attrs(raw: dict) -> dict:
    return raw.get("attributes") or {}


def _rel_id(raw: dict, name: str) -> str | None:
    data = ((raw.get("relationships") or {}).get(name) or {}).get("data")
    if not data:
        return None
    if isinstance(data, list):
        return data[0]["id"] if data else None
    return data.get("id")


def _rel_ids(raw: dict, name: str) -> list[str]:
    data = ((raw.get("relationships") or {}).get(name) or {}).get("data")
    if not data:
        return []
    if isinstance(data, list):
        return [d["id"] for d in data]
    return [data["id"]]


def _status_from_deleted(a: dict) -> str:
    return "off" if a.get("deleted") else a.get("status", "on")


def _dt(v: str | None) -> datetime | None:
    """Parse a Posiflora ISO-8601 timestamp (e.g. '2026-05-27T15:37:13+00:00')."""
    if not v:
        return None
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


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


def _date_only(v: str | None) -> date | None:
    if not v:
        return None
    return date.fromisoformat(v[:10])  # 'YYYY-MM-DD...' -> date object


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


# ---------- staff (workers) ----------
# Posiflora splits a staff member across two resources: `workers` (name,
# phone, salary — no login/status) and `users` (login, PIN, on/off status),
# linked 1:1 via the worker's `user` relationship. Both must be fetched with
# `include=user,stores` for this to resolve; `positions` is fetched too but
# not currently mapped to our Role model (different shape — permission sets
# vs. a bare title).


def map_worker(raw: dict, users_by_id: dict[str, dict] | None = None) -> dict:
    """Posiflora worker (+ its linked `users` include) -> Worker model kwargs.

    Deliberately omits `password_hash`/`pin_hash`/`role_id` — imported workers
    have no local password (see posiflora_import.import_workers) and can't log
    into the admin; that's expected, they exist so orders can show a real
    "Автор заказа"/"Флорист" instead of blank.
    """
    a = _attrs(raw)
    first = (a.get("firstName") or "").strip()
    last = (a.get("lastName") or "").strip()
    full_name = " ".join(p for p in [first, last] if p) or first or last or ""

    user_id = _rel_id(raw, "user")
    user = (users_by_id or {}).get(user_id) if user_id else None
    login = (user or {}).get("login") or None
    # Posiflora's user status is on/off; Worker.status is active/inactive.
    user_status = (user or {}).get("status")
    status = "inactive" if user_status == "off" else "active"

    store_ids = _rel_ids(raw, "stores")
    phone = a.get("phone") or ""
    country_code = a.get("countryCode")
    if phone and country_code and not phone.startswith(str(country_code)):
        phone = f"{country_code}{phone}"

    return {
        "id": raw["id"],
        "name": full_name,
        "surname": last or None,
        "patronymic": a.get("middleName") or None,
        "phone": phone or None,
        "email": a.get("email") or None,
        "login": login,
        "status": status,
        "store_id": store_ids[0] if store_ids else None,
        "store_ids": json.dumps(store_ids) if store_ids else None,
    }


def index_included_users(included: list[dict]) -> dict[str, dict]:
    """{user_id: {"login": ..., "status": ...}} from a `/v1/workers?include=user`
    response's `included`, for map_worker's `users_by_id` argument."""
    return {
        i["id"]: {"login": _attrs(i).get("login"), "status": _attrs(i).get("status")}
        for i in included
        if i.get("type") == "users"
    }


# ---------- recipe graph (spec-driven) ----------

def map_specification(raw: dict) -> dict:
    a = _attrs(raw)
    tag_ids = _rel_ids(raw, "tags")
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
        # АВТОР select (admin-map §2.3.2) — Posiflora's `createdBy` on the spec
        # resource. FK-checked against imported workers by the caller (import
        # runner), same convention as every other cross-entity FK here.
        "author_id": _rel_id(raw, "createdBy"),
        "tags_json": json.dumps(tag_ids) if tag_ids else None,
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


# Posiflora `orders.status` -> our ORDER_STATUSES (app/models.py). Keys
# confirmed live against floreii.posiflora.com/api (2052 orders fetched
# 2026-07-18, store 04797ede-f160-408a-b54e-96b4cd7282c3):
#   done: 1779, canceled: 253, returned: 15, assembled: 1, new: 4.
# `courier`/`credit` are our own workflow states with no observed Posiflora
# counterpart on this account — `deliveryStatus` was null on every order
# fetched, so there is no live signal to distinguish "у курьера" from
# "собран" here. Left unmapped; add a case if a future account surfaces one.
POSIFLORA_ORDER_STATUS_MAP = {
    "new": "new",
    "assembled": "assembled",
    "done": "completed",
    "canceled": "cancelled",
    "returned": "return",
}


def map_order_status(raw_status: str | None) -> str:
    """Posiflora order status -> ORDER_STATUSES. Unknown values are logged and
    fall back to 'new' rather than raising, so one unexpected status can't
    abort the whole import."""
    mapped = POSIFLORA_ORDER_STATUS_MAP.get(raw_status)
    if mapped is None:
        logger.warning("unknown Posiflora order status %r -> 'new'", raw_status)
        return "new"
    return mapped


def _order_number_from_doc_no(doc_no: str | None) -> int | None:
    """Best-effort numeric order number from Posiflora's docNo.

    Live docNo formats seen: '25aaaa000164' and 'aaab25001495' — inconsistent
    (year prefix vs. suffix around a junk token), so there's no single clean
    serial to extract. Take the trailing run of digits; returns None if the
    docNo has no trailing digits at all.
    """
    if not doc_no:
        return None
    m = re.search(r"(\d+)$", doc_no)
    return int(m.group(1)) if m else None


def _order_phone(a: dict) -> str:
    code = a.get("deliveryPhoneCode") or ""
    number = a.get("deliveryPhoneNumber") or ""
    return f"{code}{number}" if (code or number) else ""


def map_order(raw: dict, customer_lookup: dict[str, dict] | None = None) -> dict:
    """Posiflora order -> Order model kwargs.

    `customer_lookup` is {customer_id: {"name": ..., "phone": ...}} built by
    the caller from the already-imported Customer rows (customers import
    before orders — see posiflora_import.run). Most live orders have empty
    deliveryContact/deliveryPhoneNumber (the recipient fields are only filled
    when explicitly different from the account holder), so the account's own
    customer name/phone is the fallback that makes the admin "Клиент" column
    non-empty.
    """
    a = _attrs(raw)
    customer_id = _rel_id(raw, "customer")
    customer = (customer_lookup or {}).get(customer_id) if customer_id else None

    customer_name = a.get("deliveryContact") or (customer or {}).get("name") or ""
    phone = _order_phone(a) or (customer or {}).get("phone") or ""

    due_time = a.get("dueTime")
    # `date` is Posiflora's own order/document date (matches createdAt's date
    # portion on every sample checked) — NOT a delivery target, so it is not
    # mapped to due_date ("когда выполнить"). due_date is instead derived from
    # dueTime's date portion, which is the actual fulfillment target.
    due_date = due_time[:10] if due_time else None

    return {
        "id": raw["id"],
        "posiflora_id": raw["id"],
        "posiflora_doc_no": a.get("docNo"),
        "order_number": _order_number_from_doc_no(a.get("docNo")),
        "customer_name": customer_name,
        "phone": phone,
        "address": _order_address(a),
        "comment": a.get("description") or None,
        "delivery_comment": a.get("deliveryComments") or None,
        "due_time": due_time,
        "due_date": due_date,
        "budget": _money(a.get("budget")) if a.get("budget") is not None else None,
        "delivery_city": a.get("deliveryCity") or None,
        "delivery_street": a.get("deliveryStreet") or None,
        "delivery_house": a.get("deliveryHouse") or None,
        "delivery_apartment": a.get("deliveryApartment") or None,
        "delivery_building": a.get("deliveryBuilding") or None,
        "delivery_time_from": a.get("deliveryTimeFrom"),
        "delivery_time_to": a.get("deliveryTimeTo"),
        # `totalAmount` is the order's own sum — never `paymentsAmount` (what's
        # actually been paid so far); that stays derived from order-payments.
        "total_amount": _money(a.get("totalAmount")),
        # Posiflora's `status` is the CRM/fulfillment workflow status (new,
        # assembled, completed, ...) — payment_status is derived separately
        # from order-payments once those are imported (see import_orders_payment_status).
        "status": map_order_status(a.get("status")),
        "store_id": _rel_id(raw, "store"),
        "source_id": _rel_id(raw, "source"),
        "customer_id": customer_id,
        "created_by_id": _rel_id(raw, "createdBy"),
        "closed_by_id": _rel_id(raw, "postedBy"),
        # created_at/updated_at are NOT NULL columns — Posiflora sends both on
        # every order observed live (2052/2052), but fall back to "now" rather
        # than crash the import if a future payload ever omits them.
        "created_at": _dt(a.get("createdAt")) or datetime.utcnow(),
        "updated_at": _dt(a.get("updatedAt")) or datetime.utcnow(),
        "closed_at": _dt(a.get("postedAt")),
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


# ---------- dictionaries ----------

def map_dictionary_simple(raw: dict) -> dict:
    a = _attrs(raw)
    return {"id": raw["id"], "title": a.get("title") or ""}


# ---------- warehouse documents (headers) ----------
# Worker FKs come from each document's `createdBy` relationship (confirmed
# present live on packing-invoices, write-off-invoices, sorting-acts and
# inventory-acts — markdown-acts/movement-acts were empty on the account
# checked, so their shape is unverified but the field name is consistent
# across the other four). Our model has one worker/author column per doc, not
# a separate created/posted pair, so `createdBy` is used (who actually
# performed the document) rather than `postedBy`. Line-item shapes are only
# verified for packing; other docs import headers only for now.

def _qty(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def map_packing_invoice(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "date": _date_only(a.get("date")),
        "store_id": _rel_id(raw, "store"), "vendor_id": _rel_id(raw, "vendor"),
        "worker_id": _rel_id(raw, "createdBy"), "total_amount": _money(a.get("amount")),
        "payment_amount": _money(0), "items_count": a.get("linesCount") or 0,
        "status": a.get("status", "draft"),
    }


def map_packing_line(raw: dict, invoice_id: str) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "invoice_id": invoice_id, "item_id": _rel_id(raw, "item"),
        "quantity": _qty(a.get("qty")), "price": _money(a.get("cost")),
        "amount": _money(a.get("amount")),
    }


def map_writeoff_invoice(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "date": _date_only(a.get("date")),
        "store_id": _rel_id(raw, "store"), "reason": None,
        "worker_id": _rel_id(raw, "createdBy"),
        "total_amount": _money(a.get("amount")), "items_count": a.get("linesCount") or 0,
        "status": a.get("status", "draft"),
    }


def map_inventory_act(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "act_date": _date_only(a.get("date")),
        "posted_date": _date_only(a.get("postedAt")), "store_id": _rel_id(raw, "store"),
        "worker_id": _rel_id(raw, "createdBy"),
        "items_count": a.get("linesCount") or 0,
        "financial_result": _money(a.get("amount")), "status": a.get("status", "draft"),
    }


def map_sorting_act(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "created_date": _date_only(a.get("date")),
        "posted_date": _date_only(a.get("postedAt")), "store_id": _rel_id(raw, "store"),
        "author_id": _rel_id(raw, "createdBy"),
        "items_count": a.get("linesCount") or 0, "status": a.get("status", "draft"),
    }


def map_markdown_act(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "created_date": _date_only(a.get("date")),
        "posted_date": _date_only(a.get("postedAt")), "store_id": _rel_id(raw, "store"),
        "author_id": _rel_id(raw, "createdBy"),
        "items_count": a.get("linesCount") or 0, "status": a.get("status", "draft"),
    }


def map_movement_act(raw: dict) -> dict:
    a = _attrs(raw)
    return {
        "id": raw["id"], "doc_no": a.get("docNo"), "date": _date_only(a.get("date")),
        "from_store_id": _rel_id(raw, "fromStore") or _rel_id(raw, "store"),
        "to_store_id": _rel_id(raw, "toStore"), "worker_id": _rel_id(raw, "createdBy"),
        "cost": _money(a.get("amount")), "items_count": a.get("linesCount") or 0,
        "status": a.get("status", "draft"),
    }
