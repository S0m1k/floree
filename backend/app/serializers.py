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


def variant_price_resource(p, composition_total: float = 0.0) -> dict:
    """A general (store_id NULL) price or a per-store override.

    `priceValue` NULL on a store-scoped row means «по цене состава» — the
    effective sale price falls back to `compositionTotal` (admin-map §2.3.2).
    """
    is_default_price = p.store_id is not None and p.price_value is None
    effective = p.price_value if p.price_value is not None else composition_total
    a = {
        "priceValue": p.price_value,
        "effectivePrice": effective,
        "isDefaultPrice": is_default_price,
        "fixPrice": False,
        "compositionPrice": composition_total,
        "status": p.status,
    }
    rels = {
        "specVariants": rel_one("specification-with-variants", p.spec_with_variants_id),
        "store": rel_one("stores", p.store_id),
    }
    return resource("specification-variant-prices", p.id, a, rels)


def specification_composition_resource(comp, item) -> dict:
    """One «Состав варианта рецепта» line (admin-map §2.3.2). Priced live from
    the item's retail (max) price — nothing here is a frozen snapshot."""
    qty = float(comp.quantity or 0)
    retail_price = float(item.max_price) if item is not None else 0.0
    a = {
        "quantity": qty,
        "retailPrice": retail_price,
        "sum": round(qty * retail_price, 2),
        "position": comp.position,
    }
    rels = {
        "specVariants": rel_one("specification-with-variants", comp.spec_with_variants_id),
        "item": rel_one("inventory-items", comp.item_id),
    }
    return resource("specification-compositions", comp.id, a, rels)


def swv_resource(swv, inc: Included, items_by_id: dict | None = None) -> dict:
    items_by_id = items_by_id or {}

    composition_total = 0.0
    comp_ids: list[str] = []
    for comp in swv.compositions:
        item = items_by_id.get(comp.item_id)
        inc.add(specification_composition_resource(comp, item))
        comp_ids.append(comp.id)
        composition_total += float(comp.quantity or 0) * (float(item.max_price) if item else 0.0)
    composition_total = round(composition_total, 2)

    a = {
        "status": swv.status,
        "isDefault": bool(swv.is_default),
        "compositionTotal": composition_total,
        "width": None,
        "height": None,
    }
    price_ids = []
    for p in swv.prices:
        inc.add(variant_price_resource(p, composition_total))
        price_ids.append(p.id)
    if swv.variant is not None:
        inc.add(variant_resource(swv.variant))
    rels = {
        "variant": rel_one("specification-variants", swv.variant_id),
        "logo": rel_one("images", None),
        "tags": rel_many("tags", []),
        "specVariantPrices": rel_many("specification-variant-prices", price_ids),
        "composition": rel_many("specification-compositions", comp_ids),
    }
    return resource("specification-with-variants", swv.id, a, rels)


# ---------- specifications (recipes) ----------

def specification_resource(
    spec, inc: Included, with_variants: bool = False, items_by_id: dict | None = None
) -> dict:
    tag_ids = _json_list(spec.tags_json)
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
    for g in spec.gallery:
        if g.image is not None:
            inc.add(image_resource(g.image))
            image_ids.append(g.image_id)
    if spec.logo is not None and spec.logo_id not in image_ids:
        inc.add(image_resource(spec.logo))
        image_ids.append(spec.logo_id)

    rels = {
        "category": rel_one("categories", spec.category_id),
        "images": rel_many("images", image_ids),
        "logo": rel_one("images", spec.logo_id),
        "createdBy": rel_one("workers", None),
        "author": rel_one("workers", spec.author_id),
        "recipeTags": rel_many("recipe-tags", tag_ids),
    }

    if with_variants:
        swv_ids: list[str] = []
        for swv in spec.variants:
            inc.add(swv_resource(swv, inc, items_by_id))
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
        "instagram": cust.instagram,
        "status": "on",
        "isPerson": cust.customer_type != "company",
        # person (Физическое лицо) | company (Юридическое лицо)
        "customerType": cust.customer_type or "person",
        # «Номер карты» from the admin form. Distinct from bonus_cards (the
        # Wallet-card template the business issues).
        "cardNumber": cust.card_number,
        "preferences": cust.preferences,
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
        "discountGroups": rel_many(
            "discount-groups", [cust.discount_group_id] if cust.discount_group_id else []
        ),
        "bonusGroup": rel_one("bonus-groups", cust.bonus_group_id),
        # «Откуда узнал о нас» — the admin customer form's source select.
        "source": rel_one("order-sources", cust.source_id),
        "customerSources": rel_many("customer-sources", []),
        "customerPreferences": rel_many("customer-preferences", []),
        "customerEvents": rel_one("customer-events", None),
        "bonusCards": rel_one("bonus-cards", None),
    }
    return resource("customers", cust.id, a, rels, links={"self": f"/customers/{cust.id}"})


# ---------- customer bonus history ----------

def customer_bonus_history_resource(h) -> dict:
    """История списаний/начислений бонусов (карточка клиента, вкладка
    «Бонусы»). Written by the manual balance adjustment in
    PATCH /v1/customers/{id} — not a Posiflora API field, our own extension.
    """
    a = {
        "amount": h.amount,
        "comment": h.comment or "",
        "createdAt": _iso(h.created_at),
    }
    rels = {
        "order": rel_one("orders", h.order_id),
        "worker": rel_one("users", h.worker_id),
    }
    return resource("customer-bonus-history", h.id, a, rels)


# ---------- loyalty (bonus groups / discount groups / bonus cards) ----------
# admin-map §2.5.4-2.5.6 — Клиенты и развитие → Система лояльности.

def bonus_group_resource(g) -> dict:
    a = {
        "title": g.title,
        "accrualPercent": g.accrual_percent,
        "maxPercent": g.max_percent,
        "entryThreshold": g.entry_threshold,
        "isPublic": g.is_public,
        "status": g.status,
    }
    return resource("bonus-groups", g.id, a, links={"self": f"/bonus-groups/{g.id}"})


def discount_group_resource(g) -> dict:
    a = {
        "title": g.title,
        "discountPercent": g.discount_percent,
        "entryThreshold": g.entry_threshold,
        "isPublic": g.is_public,
        "status": g.status,
    }
    return resource("discount-groups", g.id, a, links={"self": f"/discount-groups/{g.id}"})


def bonus_card_resource(c) -> dict:
    a = {
        "title": c.title,
        "shopName": c.shop_name,
        "status": c.status,
        "createdAt": _iso(c.created_at),
    }
    rels = {"logo": rel_one("images", c.logo_id)}
    return resource("bonus-cards", c.id, a, rels, links={"self": f"/bonus-cards/{c.id}"})


def customer_bonus_group_history_resource(h) -> dict:
    """«История изменения бонусных групп» (карточка клиента, вкладка
    «Бонусы»). worker is null when the change was automatic (written by
    POST /v1/bonus-groups/recalculate) — the admin UI shows «автоматически».
    """
    a = {
        "changedAt": _iso(h.changed_at),
        "isAutomatic": h.is_automatic,
    }
    rels = {
        "oldGroup": rel_one("bonus-groups", h.old_group_id),
        "newGroup": rel_one("bonus-groups", h.new_group_id),
        "worker": rel_one("users", h.worker_id),
    }
    return resource("customer-bonus-group-history", h.id, a, rels)


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
        "deliveryComments": getattr(order, "delivery_comment", None) or "",
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


# ---------- order items (Продукты → Состав заказа) ----------

def _num(value) -> float:
    """Decimal/None → float for JSON:API money/qty attributes."""
    from decimal import Decimal
    if value is None:
        return 0.0
    return float(value) if isinstance(value, (Decimal, int, float)) else 0.0


def order_item_resource(item) -> dict:
    """One «Состав заказа» line (bouquet parent, its components, or a good).

    `originalSum` is unit_price × quantity before per-line discount/markup;
    `sum` folds them in. When they differ the admin UI shows the original struck
    through next to the bold final — 1:1 with Posiflora (admin-map §2.2.1).
    """
    unit = _num(item.unit_price)
    qty = _num(item.quantity)
    markup = _num(item.markup)
    discount = _num(item.discount)
    original = round(unit * qty, 2)
    total = round(original - discount + markup, 2)
    discount_percent = getattr(item, "discount_percent", None)
    markup_percent = getattr(item, "markup_percent", None)
    a = {
        "kind": item.kind,
        "title": item.title,
        "unitPrice": unit,
        "quantity": qty,
        "measure": item.measure,
        "markup": markup,
        "discount": discount,
        "originalSum": original,
        "sum": total,
        # How the discount/markup was entered — percent is display-only, the
        # money columns above stay authoritative (PUT /orders/{id}/discount).
        "discountPercent": float(discount_percent) if discount_percent is not None else None,
        "markupPercent": float(markup_percent) if markup_percent is not None else None,
        "createdAt": _iso(item.created_at),
    }
    rels = {
        "parent": rel_one("order-items", item.parent_id),
        "order": rel_one("orders", item.order_id),
        "bouquet": rel_one("bouquets", item.bouquet_id),
        "inventoryItem": rel_one("inventory-items", item.inventory_item_id),
        "discountReason": rel_one("discount-reasons", getattr(item, "discount_reason_id", None)),
        "markupReason": rel_one("discount-reasons", getattr(item, "markup_reason_id", None)),
    }
    return resource("order-items", item.id, a, rels)


# ---------- order-payments ----------

def order_payment_resource(p) -> dict:
    confirmed = p.status in ("CONFIRMED", "paid")
    is_advance = getattr(p, "kind", "payment") == "advance"
    a = {
        "paymentType": getattr(p, "kind", None) or "payment",
        # Manual advance method (cash/card/sbp/transfer) or null for T-Bank.
        "method": getattr(p, "method", None),
        "date": _date(p.created_at),
        "amount": p.amount,
        "bonusAmount": 0,
        "description": "",
        "createdAt": _iso(p.created_at),
        "posted": confirmed,
        "postedAt": _iso(p.updated_at) if confirmed else None,
        "terminalTransactionId": p.tbank_payment_id,
        # «Фискализация аванса» column — no fiscal integration yet, always false.
        "fiscalized": False,
        "prepayment": is_advance,
        "fiscalizedAt": None,
        "paymentLink": p.payment_url,
    }
    rels = {
        "method": rel_one("payment-methods", None),
        "shift": rel_one("shifts", None),
        "order": rel_one("orders", p.order_id),
        "createdBy": rel_one("workers", getattr(p, "created_by_id", None)),
        "postedBy": rel_one("workers", None),
    }
    return resource("order-payments", p.id, a, rels)


# ---------- dictionaries ----------

def dictionary_resource(obj, type_: str, extra: dict | None = None) -> dict:
    """Generic reference dictionary (title/deleted/revision) → JSON:API.

    Two dictionaries carry extra columns beyond title: `customer-celebrations`
    (a period) and `measures` (short name + ОКЕИ measure code). Emit them
    whenever the row has the attribute, so both the plain list endpoint and
    the write handlers (which reuse this serializer for the response) return
    the same shape.
    """
    a = {
        "title": obj.title,
        "deleted": bool(getattr(obj, "deleted", False)),
        "revision": 0,
    }
    if hasattr(obj, "date_from") or hasattr(obj, "date_to"):
        a["dateFrom"] = _iso(getattr(obj, "date_from", None))
        a["dateTo"] = _iso(getattr(obj, "date_to", None))
    if hasattr(obj, "short_name") or hasattr(obj, "measure_code"):
        a["shortName"] = getattr(obj, "short_name", None)
        a["measureCode"] = getattr(obj, "measure_code", None)
    # order-sources: machine channel code (site/terminal/phone/amocrm) so
    # clients can find «their» source without matching user-editable titles.
    if hasattr(obj, "code"):
        a["code"] = getattr(obj, "code", None)
    if extra:
        a.update(extra)
    return resource(type_, obj.id, a, links={"self": f"/{type_}/{obj.id}"})


def personal_data_resource(obj) -> dict:
    """Singleton «Форма заполнения политики» template → JSON:API."""
    a = {
        "ipTitle": obj.ip_title,
        "inn": obj.inn,
        "legalAddress": obj.legal_address,
        "website": obj.website,
        "email": obj.email,
    }
    return resource("personal-data-template", obj.id, a)


def shop_settings_resource(obj) -> dict:
    """Singleton «Онлайн-витрина» settings → JSON:API."""
    a = {
        "shopTitle": obj.shop_title,
        "phone": obj.phone,
        "address": obj.address,
        "emailOrders": obj.email_orders,
        "instagram": obj.instagram,
        "telegram": obj.telegram,
        "whatsapp": obj.whatsapp,
        "isEnabled": obj.is_enabled,
        "announcement": obj.announcement,
        "updatedAt": _iso(obj.updated_at),
    }
    return resource("shop-settings", obj.id, a)


# ---------- vendors ----------

def vendor_resource(v) -> dict:
    a = {
        "title": v.title,
        "description": v.comment,
        "email": v.email,
        "phone": v.phone,
        "phoneValid": bool(v.phone),
        "countryCode": 7,
        # Our own extension (not a Posiflora field) — gates the admin UI's
        # edit/delete affordances for system vendors (Прямая поставка,
        # Уценка, …), which the backend also refuses to delete (400).
        "isSystem": bool(v.is_system),
    }
    rels = {"person": rel_one("persons", None)}
    return resource("vendors", v.id, a, rels, links={"self": f"/vendors/{v.id}"})


# ---------- warehouses ----------

def warehouse_resource(w) -> dict:
    return resource("warehouses", w.id, {"title": w.title})


# ---------- workers / roles / shifts / devices (Контроль сотрудников) ----------

def _json_list(raw: str | None) -> list:
    """Parse a JSON-list Text column defensively (None/garbage → [])."""
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def worker_resource(w) -> dict:
    """Posiflora exposes staff as `workers`. Used by the admin "Заказы" filter
    panel selects and the «Контроль сотрудников → Сотрудники» screens.

    Security: password_hash / pin_hash NEVER appear here — only their presence
    flags, so the edit form can show "пароль задан" without the secret.
    """
    store_ids = _json_list(w.store_ids) or ([w.store_id] if w.store_id else [])
    a = {
        "name": w.name,
        "surname": w.surname,
        "patronymic": w.patronymic,
        "phone": w.phone,
        "email": w.email,
        "login": w.login,
        "status": w.status,
        "accessRights": _json_list(w.access_rights),
        "storeIds": store_ids,
        "hasPassword": bool(w.password_hash),
        "hasPin": bool(w.pin_hash),
        "createdAt": _iso(w.created_at),
    }
    rels = {
        "role": rel_one("roles", w.role_id),
        "store": rel_one("stores", w.store_id),
        "stores": rel_many("stores", store_ids),
    }
    return resource("workers", w.id, a, rels, links={"self": f"/workers/{w.id}"})


def role_resource(r) -> dict:
    """Permission set (admin «Настройки доступов», admin-map §2.6.3)."""
    permissions = None
    if r.permissions:
        try:
            parsed = json.loads(r.permissions)
            permissions = parsed if isinstance(parsed, dict) else None
        except (TypeError, ValueError):
            permissions = None
    a = {
        "title": r.title,
        "permissions": permissions,
        "isSystem": bool(r.is_system),
    }
    return resource("roles", r.id, a, links={"self": f"/roles/{r.id}"})


def shift_resource(s) -> dict:
    """Cash-register shift (admin «Рабочие смены», admin-map §2.6.1)."""
    a = {
        "deviceName": s.device_name,
        "openedAt": _iso(s.opened_at),
        "closedAt": _iso(s.closed_at),
        "openDiscrepancy": s.open_discrepancy,
        "closeDiscrepancy": s.close_discrepancy,
        # POS: пересчитанный нал при открытии/закрытии (None у ETL-строк).
        "openingCash": float(s.opening_cash) if s.opening_cash is not None else None,
        "closingCash": float(s.closing_cash) if s.closing_cash is not None else None,
    }
    rels = {
        "store": rel_one("stores", s.store_id),
        "openedBy": rel_one("workers", s.opened_by_id),
        "closedBy": rel_one("workers", s.closed_by_id),
    }
    return resource("shifts", s.id, a, rels, links={"self": f"/shifts/{s.id}"})


def device_resource(d) -> dict:
    """Florist-app device binding (admin «Устройства флористов», §2.6.4)."""
    a = {
        "name": d.name,
        "createdAt": _iso(d.created_at),
    }
    rels = {"worker": rel_one("workers", d.worker_id)}
    return resource("devices", d.id, a, rels, links={"self": f"/devices/{d.id}"})


# ---------- inventory items (nomenclature) ----------

def item_resource(item) -> dict:
    a = {
        "title": item.title,
        "description": None,
        "itemType": item.item_type,
        "globalId": item.global_id,
        "barcode": item.barcode,
        "status": item.status,
        "updatedAt": _iso(item.updated_at),
        "added": None,
        "postfix": None,
        "public": bool(item.public),
        "fractional": bool(item.fractional),
        "priceMin": item.min_price,
        "priceMax": item.max_price,
        "revision": 0,
        "deleted": item.status == "deleted",
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


# ---------- Учёт и финансы: расходы / выгрузки (admin-map §2.4.5-2.4.8) ----------

def expense_resource(e) -> dict:
    a = {
        "article": e.article,
        "amount": float(e.amount),
        "date": _iso(e.date),
        "comment": e.comment,
        "createdAt": _iso(e.created_at),
    }
    rels = {
        "store": rel_one("stores", e.store_id),
        "createdBy": rel_one("workers", e.created_by_id),
    }
    return resource("expenses", e.id, a, rels)


def generated_file_resource(f) -> dict:
    a = {
        "kind": f.kind,
        "title": f.title,
        "periodFrom": _iso(f.period_from),
        "periodTo": _iso(f.period_to),
        "status": f.status,
        "createdAt": _iso(f.created_at),
    }
    rels = {"createdBy": rel_one("workers", f.created_by_id)}
    return resource("generated-files", f.id, a, rels)


def promo_code_resource(obj) -> dict:
    return resource("promo-codes", obj.id, {
        "code": obj.id,
        "percent": float(obj.percent),
        "isActive": obj.is_active,
        "updatedAt": _iso(obj.updated_at),
    })


def payment_settings_resource(obj) -> dict:
    """Ключи эквайринга: секрет наружу не отдаём никогда — только факт наличия."""
    return resource("payment-settings", obj.id, {
        "activeProvider": obj.active_provider,
        "terminalKey": obj.tbank_terminal_key,
        "hasSecret": bool(obj.tbank_secret_key),
        "yapayMerchantId": obj.yapay_merchant_id,
        "hasYapayApiKey": bool(obj.yapay_api_key),
        "yapaySandbox": bool(obj.yapay_sandbox),
        "updatedAt": _iso(obj.updated_at),
    })
