import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# Money precision: transactional amounts use Numeric(12,2) so fractional
# rubles from Posiflora (e.g. 5142.50) are preserved exactly. Catalog prices
# stay Integer (integer rubles on the vendor).
Money = Numeric(12, 2)


# Workflow (CRM/fulfillment) statuses, matching Posiflora's `orders.status` and
# the admin "Заказы" status tabs (docs/posiflora/admin-map.md §2.2).
ORDER_STATUSES = ("new", "assembled", "courier", "completed", "cancelled", "return", "credit")

# Terminal workflow statuses — once an order reaches one of these it cannot be
# moved again (admin PATCH /v1/orders/{id} returns 409). Matches Posiflora's
# rule that closed/cancelled/returned orders are read-only.
TERMINAL_STATUSES = ("completed", "cancelled", "return")

# Order fulfillment method for admin-created orders (docs/posiflora/admin-map.md
# §2.2.2 «Получение заказа»).
DELIVERY_TYPES = ("pickup", "delivery")

# Order-item kinds (order card «Продукты» tab, admin-map §2.2.1). A `bouquet`
# row is a showcase bouquet with (optionally) `item` component rows nested under
# it via parent_id; standalone goods are top-level `item` rows.
ORDER_ITEM_KINDS = ("bouquet", "item", "delivery", "custom")

# Default unit label for an order line — Posiflora shows «Штука» for piece goods.
DEFAULT_MEASURE = "Штука"

# Manual (in-store) payment methods for advances taken on the order card
# «Продукты» tab (admin-map §2.2.1). T-Bank webhook payments carry no `method`.
PAYMENT_METHODS = ("cash", "card", "sbp", "transfer")

# Payment statuses that count as money actually received against the order.
SETTLED_PAYMENT_STATUSES = ("CONFIRMED", "paid")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    posiflora_id: Mapped[str | None] = mapped_column(String, nullable=True)
    posiflora_doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    customer_name: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String)
    address: Mapped[str] = mapped_column(String)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_time: Mapped[str | None] = mapped_column(String, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles (2dp)

    # Admin-created orders (POST /v1/orders) — Posiflora CRM create form
    # (docs/posiflora/admin-map.md §2.2.2). All nullable so ETL/checkout rows
    # that predate these columns keep working.
    # Sequential human-facing order number, generated server-side. Distinct from
    # posiflora_doc_no (imported rows carry Posiflora's own doc number there).
    order_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # «Бюджет» — an advisory target, NOT the order price. Prices are never taken
    # from the client (admin-map.md §2.2.1); order sums are computed server-side.
    budget: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    # «Получение заказа»: pickup | delivery.
    delivery_type: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_city: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_street: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_house: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_apartment: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_building: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_time_from: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_time_to: Mapped[str | None] = mapped_column(String, nullable=True)
    # Courier-facing delivery note — Posiflora's `deliveryComments`, distinct
    # from `comment` (the customer's own wishes, Posiflora's `description`).
    delivery_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # «Когда выполнить» — target date (YYYY-MM-DD). due_time keeps the full ISO
    # timestamp for back-compat with the checkout/ETL path.
    due_date: Mapped[str | None] = mapped_column(String, nullable=True)
    # «Быстрые теги» — JSON array of order-tag ids.
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # CRM/fulfillment status — one of ORDER_STATUSES. This is Posiflora's real
    # `orders.status` (assembly/delivery workflow), distinct from the payment
    # gateway lifecycle tracked in `payment_status`.
    status: Mapped[str] = mapped_column(String, default="new")
    # Payment gateway lifecycle: pending, paid, failed, cancelled, amount_mismatch.
    payment_status: Mapped[str] = mapped_column(String, default="pending")
    bouquet_ids: Mapped[str] = mapped_column(Text)  # JSON array of priced order items
    # Full create args (JSON) so the Posiflora order can be built lazily in the
    # payment webhook — the order is only pushed to Posiflora after CONFIRMED.
    order_payload: Mapped[str | None] = mapped_column(Text, nullable=True)

    store_id: Mapped[str | None] = mapped_column(String, ForeignKey("stores.id"), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String, ForeignKey("customer_deal_sources.id"), nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String, ForeignKey("customers.id"), nullable=True)
    florist_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    closed_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Order-level money adjustments shown on the «Продукты» итоговая панель
    # (admin-map §2.2.1), set via PUT /v1/orders/{id}/discount (target=order).
    # Per-line adjustments live on OrderItem instead.
    markup_total: Mapped[Decimal] = mapped_column(Money, default=0)
    discount_total: Mapped[Decimal] = mapped_column(Money, default=0)
    # «Оплата бонусами» — bonuses spent against this order, set via
    # PUT /v1/orders/{id}/bonus-payment. 1 bonus point == 1 ruble.
    bonus_paid: Mapped[Decimal] = mapped_column(Money, default=0)
    # How the order-level discount/markup was entered — percent is display-only
    # (discount_total/markup_total above stay authoritative for money math);
    # the reason is picked from the shared «Причины скидок и надбавок»
    # dictionary (discount_reasons, admin-map §2.7).
    discount_reason_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("discount_reasons.id"), nullable=True
    )
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    markup_reason_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("discount_reasons.id"), nullable=True
    )
    markup_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    # store/source/florist/created_by/closed_by are plain FKs, resolved by a
    # separate lookup where needed — matching the rest of the codebase's
    # convention of not declaring ORM relationship() across model modules
    # (see inventory_models.py store_id usages).
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="order")
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        "OrderStatusHistory", back_populates="order", order_by="OrderStatusHistory.changed_at"
    )
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="order", order_by="OrderItem.created_at"
    )


class OrderItem(Base):
    """Строка состава заказа (order card «Продукты» → «Состав заказа»).

    Prices are ALWAYS taken from the server's own catalog when a line is added
    (never from the client — admin-map §2.2.1, memory payment-price-vuln); the
    snapshot columns freeze what was charged so later catalog edits don't rewrite
    history. A `bouquet` row may own nested `item` component rows (parent_id),
    mirroring the recipe breakdown Posiflora shows under a bouquet.
    """

    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"), index=True)
    # Self-FK: component rows point at their parent bouquet row.
    parent_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("order_items.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String)  # one of ORDER_ITEM_KINDS
    bouquet_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("bouquets.id"), nullable=True
    )
    inventory_item_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("items.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String)  # snapshot of the source title
    unit_price: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles (2dp)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=1)
    measure: Mapped[str] = mapped_column(String, default=DEFAULT_MEASURE)
    markup: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles, per line
    discount: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles, per line
    # Same percent/reason detail as Order.discount_*/markup_* above, but for a
    # per-line discount/markup (PUT /v1/orders/{id}/discount, target=item).
    discount_reason_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("discount_reasons.id"), nullable=True
    )
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    markup_reason_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("discount_reasons.id"), nullable=True
    )
    markup_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # No self-referential ORM relationship: the parent/child tree is small and
    # built in Python from parent_id (see routers/v1_sales.py order-items), which
    # keeps the mapper config simple and the loads explicit.
    order: Mapped["Order"] = relationship("Order", back_populates="items")


class OrderStatusHistory(Base):
    """История смены статусов заказа (admin `/admin/orders/:id`, вкладка «Общая информация»)."""

    __tablename__ = "order_status_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"))
    status: Mapped[str] = mapped_column(String)
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"))
    tbank_payment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # OrderId sent to T-Bank for gateway payments. Manual in-store advances have
    # no gateway leg, so they store a synthetic "manual-<uuid>" here to satisfy
    # the NOT NULL constraint without touching the webhook/checkout flow.
    tbank_order_id: Mapped[str] = mapped_column(String)
    amount: Mapped[Decimal] = mapped_column(Money)  # rubles (2dp)
    status: Mapped[str] = mapped_column(String, default="INIT")  # INIT, NEW, CONFIRMED, CANCELLED, REJECTED
    # Manual advance metadata (order card «Продукты» → «Добавить аванс»). NULL
    # for T-Bank gateway payments, which are identified by the tbank_* columns.
    method: Mapped[str | None] = mapped_column(String, nullable=True)  # PAYMENT_METHODS
    kind: Mapped[str] = mapped_column(String, default="payment")  # payment | advance
    created_by_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("workers.id"), nullable=True
    )
    payment_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="payments")


# Phase 1 — domain models. Imported here so they register on Base.metadata for
# Alembic (alembic/env.py imports Base from app.models). Order matters only for
# readability; SQLAlchemy resolves FKs by table name at configure time.
from app import catalog_models  # noqa: E402,F401
from app import dictionary_models  # noqa: E402,F401
from app import inventory_models  # noqa: E402,F401
from app import staff_models  # noqa: E402,F401
from app import loyalty_models  # noqa: E402,F401
