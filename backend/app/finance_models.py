"""Учёт и финансы → Отчёты / Финансовый учёт / история выгрузок.

`Expense` backs the «Список расходов» tab on /admin/financial-accounting
(admin-map §2.4.7). `GeneratedFile` is a generic ledger of every CSV a worker
has generated — the five report types on /admin/reports (§2.4.6), plus the
existing customers/items CSV exports (§2.4.5/§2.4.8) — so /admin/exports-list
and /admin/items-export can list history without a table per export kind.
"""

from datetime import date, datetime

from sqlalchemy import String, DateTime, Date, Text, Numeric, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal

from app.database import Base
from app.catalog_models import _uuid

Money = Numeric(12, 2)

# Fixed list of expense articles (admin-map §2.4.7). The admin form is a
# select, not free text — matches how Posiflora constrains this field.
EXPENSE_ARTICLES = (
    "Налоги и страховые взносы",
    "Типография",
    "Упаковка",
    "Коммунальные услуги",
    "Интернет",
    "Курьер",
    "Хоз блок",
    "Списание товаров",
    "Аренда",
    "Прочее",
    "Банковская комиссия",
    "ФОТ",
)

# generated_files.kind values.
REPORT_KINDS = (
    "report:payments",
    "report:sales",
    "report:vendors",
    "report:goods-flow",
    "report:bouquets",
)
EXPORT_KINDS = ("items-export", "customers-export")
GENERATED_FILE_KINDS = REPORT_KINDS + EXPORT_KINDS


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    article: Mapped[str] = mapped_column(String)  # one of EXPENSE_ARTICLES
    amount: Mapped[Decimal] = mapped_column(Money, default=0)
    date: Mapped[date] = mapped_column(Date)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("workers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GeneratedFile(Base):
    """One row per generated CSV — a report run or a customers/items export."""

    __tablename__ = "generated_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String, index=True)  # GENERATED_FILE_KINDS
    title: Mapped[str] = mapped_column(String)
    period_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, default="done")
    content: Mapped[str] = mapped_column(Text, default="")  # the CSV body
    created_by_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("workers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
