"""Phase 1 — loyalty domain (Posiflora `Клиенты и развитие → Система лояльности`).

SMS/Push campaigns (notifications, wallet-notifications, order-notifications)
are marketing surfaces left for a later phase.
"""

from datetime import datetime, date

from sqlalchemy import String, Integer, Boolean, DateTime, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.catalog_models import _uuid


class BonusGroup(Base):
    """Группа бонусной лояльности (Posiflora `bonuses`)."""

    __tablename__ = "bonus_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    accrual_percent: Mapped[int] = mapped_column(Integer, default=0)  # % к начислению
    max_percent: Mapped[int] = mapped_column(Integer, default=0)  # макс. % оплаты бонусами
    entry_threshold: Mapped[int] = mapped_column(Integer, default=0)  # порог входа, rubles
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="active")


class DiscountGroup(Base):
    """Группа скидок (Posiflora `discounts`)."""

    __tablename__ = "discount_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0)
    entry_threshold: Mapped[int] = mapped_column(Integer, default=0)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="active")


class BonusCard(Base):
    """Шаблон Wallet-карты лояльности (Posiflora `wallet-cards`/bonus-cards)."""

    __tablename__ = "bonus_cards"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    shop_name: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_id: Mapped[str | None] = mapped_column(String, ForeignKey("images.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CustomerEvent(Base):
    """Событие клиента — день рождения/праздник (admin «Календарь событий»)."""

    __tablename__ = "customer_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"))
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
