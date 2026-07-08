"""JSON:API serializers for the catalog domain (Posiflora-compatible shapes).

Each builder turns an ORM object into a JSON:API resource and registers any
related resources into the shared `Included` collector. Attribute names and
relationship keys match the live Posiflora API captured 2026-07-01.
"""

import json
from datetime import datetime, date

from app.jsonapi import resource, rel_one, rel_many, Included


def _iso(dt: datetime | date | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        # Posiflora emits offset datetimes; assume UTC if naive.
        return dt.isoformat()
    return dt.isoformat()


# ---------- images ----------

def image_resource(img) -> dict:
    a = {
        "hash": img.hash,
        "file": img.file,
        "fileSmall": img.file_small,
        "fileMedium": img.file_medium,
        "fileShop": img.file_shop,
        "fileLogo": None,
        "fileLogoRetina": None,
        "fileBanner": None,
        "createdAt": _iso(img.created_at),
        "globalImage": None,
    }
    return resource("images", img.id, a)


# ---------- categories ----------

def category_resource(cat, path: list[str] | None = None, path_ids: list[str] | None = None) -> dict:
    a = {
        "title": cat.title,
        "status": cat.status,
        "path": path or [],
        "pathIds": path_ids or [],
        "color": cat.color,
        "countPublicItems": 0,
        "deleted": bool(cat.deleted),
        "revision": 0,
    }
    rels = {
        "parent": rel_one("categories", cat.parent_id),
        "group": rel_one("inventory-groups", cat.group_id),
        "image": rel_one("images", None),
    }
    return resource("categories", cat.id, a, rels, links={"self": f"/categories/{cat.id}"})


def build_category_path(cat, by_id: dict) -> tuple[list[str], list[str]]:
    """Walk parent chain (root first) using a {id: category} map."""
    titles: list[str] = []
    ids: list[str] = []
    node = cat
    seen = set()
    while node is not None and node.id not in seen:
        seen.add(node.id)
        titles.insert(0, node.title)
        ids.insert(0, node.id)
        node = by_id.get(node.parent_id) if node.parent_id else None
    return titles, ids


# ---------- specification variant chain ----------

def variant_resource(v) -> dict:
    a = {"title": v.title, "updatedAt": None}
    return resource("specification-variants", v.id, a, {"tags": rel_many("tags", [])})


def variant_price_resource(p) -> dict:
    a = {
        "priceValue": p.price_value,
        "fixPrice": False,
        "compositionPrice": p.price_value,
        "status": p.status,
    }
    rels = {
        "specVariants": rel_one("specification-with-variants", p.spec_with_variants_id),
        "store": rel_one("stores", None),
    }
    return resource("specification-variant-prices", p.id, a, rels)


def swv_resource(swv, inc: Included) -> dict:
    a = {
        "status": swv.status,
        "isDefault": bool(swv.is_default),
        "width": None,
        "height": None,
    }
    price_ids = []
    for p in swv.prices:
        inc.add(variant_price_resource(p))
        price_ids.append(p.id)
    if swv.variant is not None:
        inc.add(variant_resource(swv.variant))
    rels = {
        "variant": rel_one("specification-variants", swv.variant_id),
        "logo": rel_one("images", None),
        "tags": rel_many("tags", []),
        "specVariantPrices": rel_many("specification-variant-prices", price_ids),
    }
    return resource("specification-with-variants", swv.id, a, rels)


# ---------- specifications (recipes) ----------

def specification_resource(spec, inc: Included, with_variants: bool = False) -> dict:
    a = {
        "title": spec.title,
        "status": spec.status,
        "description": spec.description or "",
        "createdAt": _iso(spec.created_at),
        "updatedAt": _iso(spec.updated_at),
        "public": bool(spec.public),
        "maxPrice": spec.max_price,
        "minPrice": spec.min_price,
        "haveInvalidVariantPrice": False,
        "videoUrl": spec.video_url,
        "revision": 0,
    }

    image_ids: list[str] = []
    if spec.logo is not None:
        inc.add(image_resource(spec.logo))
        image_ids.append(spec.logo_id)

    rels = {
        "category": rel_one("categories", spec.category_id),
        "images": rel_many("images", image_ids),
        "logo": rel_one("images", spec.logo_id),
        "createdBy": rel_one("workers", None),
    }

    if with_variants:
        swv_ids: list[str] = []
        for swv in spec.variants:
            inc.add(swv_resource(swv, inc))
            swv_ids.append(swv.id)
        rels["specVariants"] = rel_many("specification-with-variants", swv_ids)

    return resource("specifications", spec.id, a, rels)


# ---------- stores ----------

def store_resource(store) -> dict:
    a = {
        "title": store.title,
        "addressCity": None,
        "address": store.address,
        "printLogo": False,
        "printAddress": False,
        "concealmentItems": 0,
        "calculatedAt": None,
        "externalLinkId": None,
        "anotherTitle": None,
        "formDeliveryTimeFormat": "all",
        "revision": 0,
        "isSbp": False,
    }
    rels = {
        "timezone": rel_one("timezones", None),
        "warehouse": rel_one("warehouses", None),
        "image": rel_one("images", None),
        "printSettings": rel_many("print-settings", []),
        "deliveryDiapasons": rel_many("delivery-diapason", []),
    }
    return resource("stores", store.id, a, rels, links={"self": f"/stores/{store.id}"})


# ---------- customers ----------

def customer_resource(cust, stats: dict | None = None) -> dict:
    # Orders have no customer_id FK — they're matched to a customer by phone
    # (see routers/v1_sales.py list_customers). `stats` is that lookup's
    # result for this customer's phone; None means "not computed" (0s), not
    # necessarily "no orders".
    stats = stats or {"avgCheck": 0, "ordersAmount": 0, "ordersQty": 0}
    a = {
        "title": cust.name,
        "birthday": _iso(cust.birthday),
        "email": cust.email or "",
        "instagram": None,
        "status": "on",
        "isPerson": True,
        # No per-customer card assignment exists yet — bonus_cards is a
        # template the business issues, not a customer-owned instance.
        "bonusCard": None,
        "notes": cust.comment or "",
        "averageCheck": stats["avgCheck"],
        "ordersAmount": stats["ordersAmount"],
        "ordersQty": stats["ordersQty"],
        "createdAt": _iso(cust.created_at),
        "updatedAt": None,
        "spentPoints": 0,
        "currentPoints": cust.bonus_balance,
        "gender": cust.gender or "other",
        "phone": cust.phone,
        "revision": 0,
        "idAmo": None,
        "countryCode": 7,
    }
    rels = {
        "person": rel_one("persons", None),
        "discountGroups": rel_many("discount-groups", []),
        "bonusGroup": rel_one("bonus-groups", None),
        "customerSources": rel_many("customer-sources", []),
        "customerPreferences": rel_many("customer-preferences", []),
        "customerEvents": rel_one("customer-events", None),
        "bonusCards": rel_one("bonus-cards", None),
    }
    return resource("customers", cust.id, a, rels, links={"self": f"/customers/{cust.id}"})


# ---------- bouquets ----------

def bouquet_resource(bq) -> dict:
    a = {
        "qty": 1,
        "docNo": None,
        "title": bq.title,
        "height": 0,
        "width": 0,
        "description": "",
        "amount": bq.amount,
        "saleAmount": bq.sale_amount,
        "trueSaleAmount": bq.sale_amount,
        "status": bq.status,
        "onWindowAt": None,
        "createdAt": _iso(bq.created_at),
        "updatedAt": None,
        "completedAt": None,
        "public": False,
        "discount": 0,
        "discountType": "absolute",
        "markup": 0,
        "markupType": "absolute",
        "revision": 0,
        "barcode": None,
    }
    rels = {
        "store": rel_one("stores", bq.store_id),
        "createdBy": rel_one("users", None),
        "updatedBy": rel_one("users", None),
        "logo": rel_one("images", None),
        "specWithVar": rel_one("specification-with-variants", bq.spec_with_variants_id),
    }
    return resource("bouquets", bq.id, a, rels)


# ---------- orders ----------

def _date(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.date().isoformat()
    return dt.isoformat()


def order_resource(order) -> dict:
    """Serialize the checkout Order to the Posiflora `orders` shape.

    Many fields are approximations until the order aggregate is enriched
    (delivery/fiscal/posting details) — see docs/posiflora/api-clone.md.
    `paymentsAmount` is summed from confirmed payments.
    """
    paid = sum(
        p.amount for p in getattr(order, "payments", []) or []
        if p.status in ("CONFIRMED", "paid")
    )
    try:
        items = json.loads(order.bouquet_ids) or []
    except (TypeError, ValueError):
        items = []
    try:
        tag_ids = json.loads(order.tags_json) if order.tags_json else []
    except (TypeError, ValueError):
        tag_ids = []
    delivery_type = getattr(order, "delivery_type", None)
    # `delivery` boolean: prefer the explicit admin choice; fall back to
    # "has an address" for legacy checkout/ETL rows that predate delivery_type.
    is_delivery = (delivery_type == "delivery") if delivery_type else bool(order.address)
    # Human-facing doc number: admin-created orders use their sequential
    # order_number; imported rows keep Posiflora's posiflora_doc_no.
    doc_no = order.posiflora_doc_no or (
        str(order.order_number) if getattr(order, "order_number", None) is not None else None
    )
    a = {
        "status": order.status,
        # Not a Posiflora field — our own extension so the admin can tell the
        # CRM workflow status (`status`) apart from the T-Bank payment lifecycle.
        "paymentStatus": order.payment_status,
        # Not a Posiflora field either — order composition (Продукты tab) is
        # only known for checkout-created orders; ETL-imported orders have no
        # line items on read (see docs/posiflora/data-migration.md), so this
        # is `[]` for them.
        "items": items,
        "date": _date(order.created_at),
        "docNo": doc_no,
        "description": order.comment or "",
        "budget": getattr(order, "budget", None) or 0,
        "dueTime": order.due_time,
        "dueDate": getattr(order, "due_date", None),
        "delivery": is_delivery,
        "deliveryType": delivery_type or ("delivery" if is_delivery else "pickup"),
        "deliveryComments": order.comment or "",
        "deliveryCity": getattr(order, "delivery_city", None) or "",
        "deliveryStreet": getattr(order, "delivery_street", None) or "",
        "deliveryHouse": getattr(order, "delivery_house", None) or "",
        "deliveryApartment": getattr(order, "delivery_apartment", None) or "",
        "deliveryBuilding": getattr(order, "delivery_building", None) or "",
        "deliveryTimeFrom": getattr(order, "delivery_time_from", None),
        "deliveryTimeTo": getattr(order, "delivery_time_to", None),
        "deliveryContact": order.customer_name,
        "deliveryPhoneNumber": order.phone,
        "createdAt": _iso(order.created_at),
        "updatedAt": _iso(order.updated_at),
        "updatedStatusAt": None,
        "closedAt": _iso(order.closed_at),
        "modifiedAt": _iso(order.updated_at),
        "fiscal": False,
        "fiscalized": False,
        "byBonuses": False,
        "posted": order.payment_status == "paid",
        "postedAt": None,
        "cancelComment": None,
        "totalAmount": order.total_amount,
        "paymentsAmount": paid,
        "isExternal": False,
        "externalId": None,
        "deliveryStatus": None,
        "fiscalizedAt": None,
        "revision": 0,
        "amoLeadId": None,
        "deliveryPhoneCode": None,
    }
    rels = {
        "source": rel_one("order-sources", order.source_id),
        "store": rel_one("stores", order.store_id),
        "customer": rel_one("customers", getattr(order, "customer_id", None)),
        "tags": rel_many("order-tags", tag_ids),
        "postedBy": rel_one("users", None),
        "createdBy": rel_one("users", order.created_by_id),
        "closedBy": rel_one("users", order.closed_by_id),
        "florist": rel_one("users", order.florist_id),
        "lockedBy": rel_one("users", None),
        "lockedAt": rel_one("", None),
        "lockedAtSmartphone": rel_one("", None),
        "pendingPayments": rel_many("order-payments", []),
    }
    return resource("orders", order.id, a, rels, links={"self": f"/orders/{order.id}"})


# ---------- order status history ----------

def order_status_history_resource(h) -> dict:
    """История статусов (admin `/admin/orders/:id`, вкладка «Общая информация»).

    Written by POST/PATCH /v1/orders (order create + status change) and by the
    ETL import. Not a Posiflora API field — our own extension for the admin UI.
    """
    a = {"status": h.status, "changedAt": _iso(h.changed_at)}
    rels = {"worker": rel_one("users", h.worker_id)}
    return resource("order-status-history", h.id, a, rels)


# ---------- order-payments ----------

def order_payment_resource(p) -> dict:
    confirmed = p.status in ("CONFIRMED", "paid")
    a = {
        "paymentType": "payment",
        "date": _date(p.created_at),
        "amount": p.amount,
        "bonusAmount": 0,
        "description": "",
        "createdAt": _iso(p.created_at),
        "posted": confirmed,
        "postedAt": _iso(p.updated_at) if confirmed else None,
        "terminalTransactionId": p.tbank_payment_id,
        "fiscalized": False,
        "prepayment": False,
        "fiscalizedAt": None,
        "paymentLink": p.payment_url,
    }
    rels = {
        "method": rel_one("payment-methods", None),
        "shift": rel_one("shifts", None),
        "order": rel_one("orders", p.order_id),
        "createdBy": rel_one("workers", None),
        "postedBy": rel_one("workers", None),
    }
    return resource("order-payments", p.id, a, rels)


# ---------- dictionaries ----------

def dictionary_resource(obj, type_: str, extra: dict | None = None) -> dict:
    """Generic reference dictionary (title/deleted/revision) → JSON:API."""
    a = {
        "title": obj.title,
        "deleted": bool(getattr(obj, "deleted", False)),
        "revision": 0,
    }
    if extra:
        a.update(extra)
    return resource(type_, obj.id, a, links={"self": f"/{type_}/{obj.id}"})


# ---------- vendors ----------

def vendor_resource(v) -> dict:
    a = {
        "title": v.title,
        "description": v.comment,
        "email": v.email,
        "phone": v.phone,
        "phoneValid": bool(v.phone),
        "countryCode": 7,
    }
    rels = {"person": rel_one("persons", None)}
    return resource("vendors", v.id, a, rels, links={"self": f"/vendors/{v.id}"})


# ---------- warehouses ----------

def warehouse_resource(w) -> dict:
    return resource("warehouses", w.id, {"title": w.title})


# ---------- workers ----------

def worker_resource(w) -> dict:
    """Posiflora exposes staff as `workers`; the admin "Заказы" filter panel
    (КЕМ СОЗДАН / ФЛОРИСТ / КЕМ ЗАКРЫТ) needs this for its florist selects.
    """
    a = {
        "name": w.name,
        "login": w.login,
        "status": w.status,
    }
    rels = {
        "role": rel_one("roles", w.role_id),
        "store": rel_one("stores", w.store_id),
    }
    return resource("workers", w.id, a, rels, links={"self": f"/workers/{w.id}"})


# ---------- inventory items (nomenclature) ----------

def item_resource(item) -> dict:
    a = {
        "title": item.title,
        "description": None,
        "itemType": item.item_type,
        "globalId": item.global_id,
        "updatedAt": _iso(item.updated_at),
        "added": None,
        "postfix": None,
        "public": bool(item.public),
        "fractional": bool(item.fractional),
        "priceMin": item.min_price,
        "priceMax": item.max_price,
        "revision": 0,
        "deleted": False,
        "showInCheckout": False,
    }
    rels = {
        "group": rel_one("inventory-groups", None),
        "category": rel_one("categories", item.category_id),
        "measure": rel_one("measures", item.unit_id),
        "logo": rel_one("images", item.logo_id),
        "markdowns": rel_many("markdowns", []),
    }
    return resource("inventory-items", item.id, a, rels, links={"self": f"/inventory-items/{item.id}"})
