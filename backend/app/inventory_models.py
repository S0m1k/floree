"""Phase 1 — warehouse / inventory domain (Posiflora `Учёт и финансы → Склад`).

Items (nomenclature) are the catalog goods/services shown on admin
"Каталог товаров и услуг"; stock balances, vendors and the six warehouse
documents (with their line items) back the Склад screens.
"""

from datetime import datetime, date

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    Date,
    Text,
    Numeric,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.catalog_models import _uuid


class Item(Base):
    """Номенклатура — товар/услуга (Posiflora `items`, admin «Каталог товаров и услуг»)."""

    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    item_type: Mapped[str] = mapped_column(String, default="item")  # item | service
    global_id: Mapped[str | None] = mapped_column(String, nullable=True)  # link to vendor catalog
    barcode: Mapped[str | None] = mapped_column(String, nullable=True)
    category_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("categories.id"), nullable=True
    )
    unit_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("units_of_measure.id"), nullable=True
    )
    logo_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("images.id"), nullable=True
    )
    min_price: Mapped[int] = mapped_column(Integer, default=0)
    max_price: Mapped[int] = mapped_column(Integer, default=0)
    public: Mapped[bool] = mapped_column(Boolean, default=False)
    fractional: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="on")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Warehouse(Base):
    """Склад точки (Posiflora `warehouses`)."""

    __tablename__ = "warehouses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))


class StockBalance(Base):
    """Остаток позиции на складе (admin «Обзор склада»)."""

    __tablename__ = "stock_balances"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    warehouse_id: Mapped[str] = mapped_column(String, ForeignKey("warehouses.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    reserve: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    cost_price: Mapped[int] = mapped_column(Integer, default=0)  # себестоимость, rubles


class Vendor(Base):
    """Поставщик (Posiflora `vendors`)."""

    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)  # Прямая поставка, Уценка…


# ---------- Warehouse documents ----------
# Common header shape: doc_no, dates, store, counts, status, author.
# Each has a line-item table referencing `items`.


class PackingInvoice(Base):
    """Приходная накладная (Posiflora `packing-invoices`)."""

    __tablename__ = "packing_invoices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    vendor_id: Mapped[str | None] = mapped_column(String, ForeignKey("vendors.id"), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    total_amount: Mapped[int] = mapped_column(Integer, default=0)
    payment_amount: Mapped[int] = mapped_column(Integer, default=0)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["PackingInvoiceItem"]] = relationship(
        "PackingInvoiceItem", back_populates="invoice"
    )


class PackingInvoiceItem(Base):
    __tablename__ = "packing_invoice_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    invoice_id: Mapped[str] = mapped_column(String, ForeignKey("packing_invoices.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    price: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["PackingInvoice"] = relationship(
        "PackingInvoice", back_populates="lines"
    )


class WriteoffInvoice(Base):
    """Накладная на списание (Posiflora `writeoff-invoices`)."""

    __tablename__ = "writeoff_invoices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    reason: Mapped[str | None] = mapped_column(String, nullable=True)  # Порча, по инвентаризации…
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    total_amount: Mapped[int] = mapped_column(Integer, default=0)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["WriteoffInvoiceItem"]] = relationship(
        "WriteoffInvoiceItem", back_populates="invoice"
    )


class WriteoffInvoiceItem(Base):
    __tablename__ = "writeoff_invoice_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    invoice_id: Mapped[str] = mapped_column(String, ForeignKey("writeoff_invoices.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    cost_price: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["WriteoffInvoice"] = relationship(
        "WriteoffInvoice", back_populates="lines"
    )


class MarkdownAct(Base):
    """Акт уценки (Posiflora `markdown-acts`)."""

    __tablename__ = "markdown_acts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    created_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    author_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["MarkdownActItem"]] = relationship(
        "MarkdownActItem", back_populates="act"
    )


class MarkdownActItem(Base):
    __tablename__ = "markdown_act_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_id: Mapped[str] = mapped_column(String, ForeignKey("markdown_acts.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    old_price: Mapped[int] = mapped_column(Integer, default=0)
    new_price: Mapped[int] = mapped_column(Integer, default=0)

    act: Mapped["MarkdownAct"] = relationship("MarkdownAct", back_populates="lines")


class SortingAct(Base):
    """Акт пересорта (Posiflora `sorting-acts`)."""

    __tablename__ = "sorting_acts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    created_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    author_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["SortingActItem"]] = relationship(
        "SortingActItem", back_populates="act"
    )


class SortingActItem(Base):
    __tablename__ = "sorting_act_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_id: Mapped[str] = mapped_column(String, ForeignKey("sorting_acts.id"))
    item_from_id: Mapped[str | None] = mapped_column(String, ForeignKey("items.id"), nullable=True)
    item_to_id: Mapped[str | None] = mapped_column(String, ForeignKey("items.id"), nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)

    act: Mapped["SortingAct"] = relationship("SortingAct", back_populates="lines")


class InventoryAct(Base):
    """Акт инвентаризации (Posiflora `inventory-acts`)."""

    __tablename__ = "inventory_acts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    act_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    financial_result: Mapped[int] = mapped_column(Integer, default=0)  # ±, rubles
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["InventoryActItem"]] = relationship(
        "InventoryActItem", back_populates="act"
    )


class InventoryActItem(Base):
    __tablename__ = "inventory_act_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_id: Mapped[str] = mapped_column(String, ForeignKey("inventory_acts.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    expected_qty: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    actual_qty: Mapped[float] = mapped_column(Numeric(12, 3), default=0)

    act: Mapped["InventoryAct"] = relationship("InventoryAct", back_populates="lines")


class MovementAct(Base):
    """Акт перемещения между точками (Posiflora `movement-acts`)."""

    __tablename__ = "movement_acts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    doc_no: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    from_store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    to_store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    cost: Mapped[int] = mapped_column(Integer, default=0)
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lines: Mapped[list["MovementActItem"]] = relationship(
        "MovementActItem", back_populates="act"
    )


class MovementActItem(Base):
    __tablename__ = "movement_act_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_id: Mapped[str] = mapped_column(String, ForeignKey("movement_acts.id"))
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    cost_price: Mapped[int] = mapped_column(Integer, default=0)

    act: Mapped["MovementAct"] = relationship("MovementAct", back_populates="lines")
