"""Phase 1 — settings dictionaries (Posiflora `Настройки`).

Small reference tables used as enums/tags across the app. Most are a plain
id+title; units carry a short name + measure code; celebrations carry a period.
"""

from datetime import date

from sqlalchemy import String, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.catalog_models import _uuid


class OrderTag(Base):
    """Тег заказа (Posiflora `order-tags`). Чипы «Быстрые теги» в форме заказа."""

    __tablename__ = "order_tags"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class RecipeTag(Base):
    """Тег букета/рецепта (Posiflora `recipe-tags`)."""

    __tablename__ = "recipe_tags"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class DiscountReason(Base):
    """Причина скидки/надбавки (Posiflora `discount-reasons`)."""

    __tablename__ = "discount_reasons"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class CashReason(Base):
    """Причина изъятия/внесения (Posiflora `cash-reasons`)."""

    __tablename__ = "cash_reasons"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class CustomerPreference(Base):
    """Предпочтение клиента (Posiflora `customer-preferences`)."""

    __tablename__ = "customer_preferences"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class CustomerSource(Base):
    """Откуда узнали о нас (Posiflora `customer-sources`)."""

    __tablename__ = "customer_sources"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class CustomerDealSource(Base):
    """Источник сделки (Posiflora `customer-deal-sources`/order-sources).

    Чипы в форме заказа: AmoCRM, Сайт, Телефон, Терминал…
    """

    __tablename__ = "customer_deal_sources"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class CustomerCelebration(Base):
    """Праздничное событие (Posiflora `customer-celebrations`)."""

    __tablename__ = "customer_celebrations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    date_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_to: Mapped[date | None] = mapped_column(Date, nullable=True)


class UnitOfMeasure(Base):
    """Единица измерения (Posiflora `units-of-measure`)."""

    __tablename__ = "units_of_measure"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    short_name: Mapped[str | None] = mapped_column(String, nullable=True)  # шт, кг, м3
    measure_code: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ОКЕИ-тип: 0,255…
