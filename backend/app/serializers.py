"""JSON:API serializers for the catalog domain (Posiflora-compatible shapes).

Each builder turns an ORM object into a JSON:API resource and registers any
related resources into the shared `Included` collector. Attribute names and
relationship keys match the live Posiflora API captured 2026-07-01.
"""

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
    rels = {"store": rel_one("stores", None)}
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

def customer_resource(cust) -> dict:
    a = {
        "title": cust.name,
        "birthday": _iso(cust.birthday),
        "email": cust.email or "",
        "instagram": None,
        "status": "on",
        "isPerson": True,
        "bonusCard": None,
        "notes": cust.comment or "",
        "averageCheck": 0,
        "ordersAmount": 0,
        "ordersQty": 0,
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
    a = {
        "status": order.status,
        "date": _date(order.created_at),
        "docNo": order.posiflora_doc_no,
        "description": order.comment or "",
        "budget": 0,
        "dueTime": order.due_time,
        "delivery": bool(order.address),
        "deliveryComments": order.comment or "",
        "deliveryCity": "",
        "deliveryStreet": "",
        "deliveryHouse": "",
        "deliveryApartment": "",
        "deliveryBuilding": "",
        "deliveryTimeFrom": None,
        "deliveryTimeTo": None,
        "deliveryContact": order.customer_name,
        "deliveryPhoneNumber": order.phone,
        "createdAt": _iso(order.created_at),
        "updatedAt": _iso(order.updated_at),
        "updatedStatusAt": None,
        "modifiedAt": _iso(order.updated_at),
        "fiscal": False,
        "fiscalized": False,
        "byBonuses": False,
        "posted": order.status == "paid",
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
        "source": rel_one("order-sources", None),
        "store": rel_one("stores", None),
        "customer": rel_one("customers", None),
        "postedBy": rel_one("users", None),
        "createdBy": rel_one("users", None),
        "lockedBy": rel_one("users", None),
        "lockedAt": rel_one("", None),
        "lockedAtSmartphone": rel_one("", None),
        "pendingPayments": rel_many("order-payments", []),
    }
    return resource("orders", order.id, a, rels, links={"self": f"/orders/{order.id}"})


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
