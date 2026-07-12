"""Phase 1 — core catalog / customer data model for the Posiflora clone.

These tables mirror the Posiflora JSON:API entities 1:1 so the existing
frontend can keep consuming the same shapes once Phase 2 serves them from our
own DB instead of proxying the vendor. Column names are snake_case here; the
API layer (Phase 2) maps them back to the camelCase JSON:API attributes.

Naming map (JSON:API type -> table):
  stores                        -> stores
  categories                    -> categories
  images                        -> images
  specifications (рецепты)      -> specifications
  specification-variants        -> specification_variants
  specification-with-variants   -> specification_with_variants
  specification-variant-prices  -> specification_variant_prices
  bouquets                      -> bouquets
  customers                     -> customers

Order / payment tables stay in app/models.py for now and get folded into this
domain when the order flow is rebuilt (server-priced, order created only after
CONFIRMED payment).
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String,
    Integer,
    Numeric,
    Boolean,
    DateTime,
    Date,
    Text,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

Money = Numeric(12, 2)  # transactional rubles, 2 decimal places


def _uuid() -> str:
    return str(uuid.uuid4())


class Store(Base):
    """Торговая точка (Posiflora `stores` / admin retail-stores)."""

    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    timezone: Mapped[str] = mapped_column(String, default="Europe/Moscow")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Image(Base):
    """Изображение (Posiflora `images`). Multiple rendered sizes."""

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    hash: Mapped[str | None] = mapped_column(String, nullable=True)
    file: Mapped[str | None] = mapped_column(String, nullable=True)
    file_small: Mapped[str | None] = mapped_column(String, nullable=True)
    file_medium: Mapped[str | None] = mapped_column(String, nullable=True)
    file_shop: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Category(Base):
    """Категория номенклатуры/рецептов (Posiflora `categories`).

    `group_id` distinguishes catalog groups (e.g. "9" == Рецепты). Self-referential
    `parent_id` builds the tree shown on the admin Категории screen.
    """

    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    slug: Mapped[str | None] = mapped_column(String, nullable=True)
    group_id: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("categories.id"), nullable=True
    )
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="on")  # on | off
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    parent: Mapped["Category | None"] = relationship(
        "Category", remote_side="Category.id", backref="children"
    )


class Specification(Base):
    """Рецепт / спецификация (Posiflora `specifications`)."""

    __tablename__ = "specifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="on")  # on | off | deleted
    public: Mapped[bool] = mapped_column(Boolean, default=False)
    min_price: Mapped[int] = mapped_column(Integer, default=0)
    max_price: Mapped[int] = mapped_column(Integer, default=0)
    video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    category_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("categories.id"), nullable=True
    )
    logo_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("images.id"), nullable=True
    )
    # Admin «Карточка рецепта» author select (admin-map §2.3.2).
    author_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("workers.id"), nullable=True
    )
    # JSON list of recipe-tag ids («ВЫБРАТЬ ТЕГИ» multiselect) — not a
    # Posiflora API field, our own extension (same pattern as Worker.access_rights).
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    category: Mapped["Category | None"] = relationship("Category")
    logo: Mapped["Image | None"] = relationship("Image")
    variants: Mapped[list["SpecificationWithVariants"]] = relationship(
        "SpecificationWithVariants", back_populates="specification"
    )
    gallery: Mapped[list["SpecificationImage"]] = relationship(
        "SpecificationImage", order_by="SpecificationImage.position"
    )


class SpecificationImage(Base):
    """Фото в галерее рецепта (admin «Карточка рецепта», admin-map §2.3.2).

    Added via a URL (file upload is out of scope for now — see admin-map.md
    notes). `Specification.logo_id` points at whichever row is the «Основное
    фото»; this table just orders the rest of the gallery/thumbnails.
    """

    __tablename__ = "specification_images"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    specification_id: Mapped[str] = mapped_column(
        String, ForeignKey("specifications.id"), index=True
    )
    image_id: Mapped[str] = mapped_column(String, ForeignKey("images.id"))
    position: Mapped[int] = mapped_column(Integer, default=0)

    image: Mapped["Image"] = relationship("Image")


class SpecificationVariant(Base):
    """Вариант-размер (Posiflora `specification-variants`).

    The title is the quantity label rendered on the storefront, e.g. "9 штук".
    """

    __tablename__ = "specification_variants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)


class SpecificationWithVariants(Base):
    """Связка рецепт↔вариант (Posiflora `specification-with-variants`, SWV).

    Bouquets and order items reference an SWV, never a specification directly.
    """

    __tablename__ = "specification_with_variants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    specification_id: Mapped[str] = mapped_column(
        String, ForeignKey("specifications.id")
    )
    variant_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("specification_variants.id"), nullable=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="on")  # on | off

    specification: Mapped["Specification"] = relationship(
        "Specification", back_populates="variants"
    )
    variant: Mapped["SpecificationVariant | None"] = relationship(
        "SpecificationVariant"
    )
    prices: Mapped[list["SpecificationVariantPrice"]] = relationship(
        "SpecificationVariantPrice", back_populates="spec_with_variants"
    )
    compositions: Mapped[list["SpecificationComposition"]] = relationship(
        "SpecificationComposition",
        back_populates="spec_with_variants",
        order_by="SpecificationComposition.position",
    )


class SpecificationVariantPrice(Base):
    """Цена варианта (Posiflora `specification-variant-prices`).

    `price_value` is the authoritative sale price — the single source of truth
    the order flow recomputes against (anti price-tamper).

    A row with `store_id` NULL is the variant's general/default price. A row
    with `store_id` set is a per-point override (admin «Активность на точках»,
    admin-map §2.3.2); `price_value` NULL there means «по цене состава» — the
    read path falls back to the variant's composition total for that store.
    """

    __tablename__ = "specification_variant_prices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    spec_with_variants_id: Mapped[str] = mapped_column(
        String, ForeignKey("specification_with_variants.id")
    )
    price_value: Mapped[int | None] = mapped_column(Integer, nullable=True)  # rubles
    status: Mapped[str] = mapped_column(String, default="on")  # on | off
    store_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("stores.id"), nullable=True
    )

    spec_with_variants: Mapped["SpecificationWithVariants"] = relationship(
        "SpecificationWithVariants", back_populates="prices"
    )
    store: Mapped["Store | None"] = relationship("Store")


class SpecificationComposition(Base):
    """Строка состава варианта рецепта (admin «Состав варианта рецепта» modal,
    admin-map §2.3.2). Not a Posiflora API entity — our own extension so the
    admin can price a bouquet variant from its flower/goods composition
    (Item.max_price is the read-only «Розн. цена» column; quantity × price is
    summed into the variant's compositionTotal).
    """

    __tablename__ = "specification_compositions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    spec_with_variants_id: Mapped[str] = mapped_column(
        String, ForeignKey("specification_with_variants.id"), index=True
    )
    item_id: Mapped[str] = mapped_column(String, ForeignKey("items.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)

    spec_with_variants: Mapped["SpecificationWithVariants"] = relationship(
        "SpecificationWithVariants", back_populates="compositions"
    )


class Bouquet(Base):
    """Собранный букет на витрине точки (Posiflora `bouquets`)."""

    __tablename__ = "bouquets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="created")
    amount: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles (2dp)
    sale_amount: Mapped[Decimal] = mapped_column(Money, default=0)  # rubles (2dp)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    spec_with_variants_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("specification_with_variants.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    store: Mapped["Store"] = relationship("Store")
    spec_with_variants: Mapped["SpecificationWithVariants | None"] = relationship(
        "SpecificationWithVariants"
    )


class Customer(Base):
    """Клиент (Posiflora `customers`)."""

    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    gender: Mapped[str | None] = mapped_column(String, nullable=True)  # male|female|null
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    bonus_balance: Mapped[int] = mapped_column(Integer, default=0)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Admin «Создание/редактирование клиента» form fields (admin-map §2.5.1).
    instagram: Mapped[str | None] = mapped_column(String, nullable=True)
    # person (Физическое лицо) | company (Юридическое лицо)
    customer_type: Mapped[str | None] = mapped_column(String, nullable=True)
    card_number: Mapped[str | None] = mapped_column(String, nullable=True)
    preferences: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CustomerBonusHistory(Base):
    """История списаний/начислений бонусов клиента (карточка клиента,
    вкладка «Бонусы»). Ручная корректировка баланса (PATCH /v1/customers/{id}
    с bonusBalance) пишет сюда строку с дельтой и автором из JWT.
    """

    __tablename__ = "customer_bonus_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # signed delta, bonuses
    comment: Mapped[str | None] = mapped_column(String, nullable=True)
    order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
