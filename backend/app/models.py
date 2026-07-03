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
    florist_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    closed_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # store/source/florist/created_by/closed_by are plain FKs, resolved by a
    # separate lookup where needed — matching the rest of the codebase's
    # convention of not declaring ORM relationship() across model modules
    # (see inventory_models.py store_id usages).
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="order")
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        "OrderStatusHistory", back_populates="order", order_by="OrderStatusHistory.changed_at"
    )


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
    tbank_order_id: Mapped[str] = mapped_column(String)  # OrderId sent to T-Bank
    amount: Mapped[Decimal] = mapped_column(Money)  # rubles (2dp)
    status: Mapped[str] = mapped_column(String, default="INIT")  # INIT, NEW, CONFIRMED, CANCELLED, REJECTED
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
