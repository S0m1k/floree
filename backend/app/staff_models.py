"""Phase 1 — staff / shifts domain (Posiflora `Контроль сотрудников`)."""

from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.catalog_models import _uuid


class Role(Base):
    """Роль с правами (Posiflora `roles`, admin «Настройки доступов»)."""

    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    # JSON list of functional permissions, e.g. ["discounts_and_markups"]
    permissions: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)


class Worker(Base):
    """Сотрудник (Posiflora `workers`)."""

    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    login: Mapped[str | None] = mapped_column(String, nullable=True)
    role_id: Mapped[str | None] = mapped_column(String, ForeignKey("roles.id"), nullable=True)
    store_id: Mapped[str | None] = mapped_column(String, ForeignKey("stores.id"), nullable=True)
    # JSON list of access-right sets (Администратор, Флорист, Курьер, Менеджер склада…)
    access_rights: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active | inactive
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    role: Mapped["Role | None"] = relationship("Role")


class Device(Base):
    """Устройство флориста — привязка моб. приложения (Posiflora `devices`)."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Shift(Base):
    """Рабочая (кассовая) смена (Posiflora `shifts`)."""

    __tablename__ = "shifts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    device_name: Mapped[str | None] = mapped_column(String, nullable=True)  # e.g. 032351 (POS)
    opened_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    closed_by_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    open_discrepancy: Mapped[int] = mapped_column(Integer, default=0)
    close_discrepancy: Mapped[int] = mapped_column(Integer, default=0)

    opened_by: Mapped["Worker | None"] = relationship("Worker", foreign_keys=[opened_by_id])
    closed_by: Mapped["Worker | None"] = relationship("Worker", foreign_keys=[closed_by_id])


class CashOperation(Base):
    """Движение денег по кассе (Posiflora `cash`): изъятие/внесение."""

    __tablename__ = "cash_operations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    shift_id: Mapped[str | None] = mapped_column(String, ForeignKey("shifts.id"), nullable=True)
    store_id: Mapped[str] = mapped_column(String, ForeignKey("stores.id"))
    worker_id: Mapped[str | None] = mapped_column(String, ForeignKey("workers.id"), nullable=True)
    operation_type: Mapped[str] = mapped_column(String)  # in (внесение) | out (изъятие)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TelegramBotUser(Base):
    """Подписчик Telegram-бота уведомлений (Posiflora `telegram-bot-users`)."""

    __tablename__ = "telegram_bot_users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_name: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="enabled")
    # JSON list of subscribed notification types (продажи, ежедневный отчёт, касса…)
    notification_types: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
