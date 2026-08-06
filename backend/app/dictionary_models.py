"""Phase 1 — settings dictionaries (Posiflora `Настройки`).

Small reference tables used as enums/tags across the app. Most are a plain
id+title; units carry a short name + measure code; celebrations carry a period.
"""

from datetime import date, datetime

from sqlalchemy import String, Integer, Date, Boolean, Text, DateTime, func
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
    # Machine-readable channel code (site/terminal/phone/amocrm) — lets order
    # channels auto-assign their source without matching user-editable titles.
    # NULL for ad-hoc sources created via the «+» chip in the order form.
    code: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)


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


class PersonalDataTemplate(Base):
    """Шаблон согласия на обработку ПДн (Posiflora «Форма заполнения политики»,
    admin-map §2.7). Singleton — always exactly one row, keyed by a fixed id
    so GET/PUT never have to guess which row to use.
    """

    __tablename__ = "personal_data_templates"

    SINGLETON_ID = "singleton"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: PersonalDataTemplate.SINGLETON_ID)
    ip_title: Mapped[str | None] = mapped_column(String, nullable=True)
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    legal_address: Mapped[str | None] = mapped_column(String, nullable=True)
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)


class ShopSettings(Base):
    """Настройки онлайн-витрины (admin-map §2.3.2, /admin/shop-settings).

    Singleton — always exactly one row, keyed by a fixed id (same pattern as
    `PersonalDataTemplate`). Backs the admin screen that manages contact info,
    social links, the on/off switch and announcement banner for our public
    storefront (floree.ru). Note: the storefront pages themselves don't read
    these values yet — that wiring is a follow-up (see UI hint on the screen).
    """

    __tablename__ = "shop_settings"

    SINGLETON_ID = "singleton"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: ShopSettings.SINGLETON_ID)
    shop_title: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    email_orders: Mapped[str | None] = mapped_column(String, nullable=True)
    instagram: Mapped[str | None] = mapped_column(String, nullable=True)
    telegram: Mapped[str | None] = mapped_column(String, nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    announcement: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class PromoCode(Base):
    """Промокоды витрины — управляются из админки (/admin/payment-settings).

    id = сам код в верхнем регистре. Скидка применяется строго на сервере в
    create_order; выключенный код ведёт себя как несуществующий.
    """

    __tablename__ = "promo_codes"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # код, UPPERCASE
    percent: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class PaymentSettings(Base):
    """Ключи эквайринга Т-Банк — редактируются из админки.

    Singleton по образцу ShopSettings. Пустые поля означают «брать из .env»,
    так что заполненная строка в БД всегда приоритетнее окружения.
    """

    __tablename__ = "payment_settings"

    SINGLETON_ID = "singleton"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: PaymentSettings.SINGLETON_ID)
    tbank_terminal_key: Mapped[str | None] = mapped_column(String, nullable=True)
    tbank_secret_key: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
