"""Фискализация (54-ФЗ) — журнал чеков, пробитых через облако aQsi.

Каждая продажа POS порождает строку fiscal_receipts. Чек пробивается
асинхронной операцией на кассе (aQsi device operation): мы храним operationId
и статус, продажа никогда не блокируется недоступной кассой — упавший чек
остаётся в статусе failed и добивается повтором (54-ФЗ требует чек в момент
расчёта, поэтому UI показывает ошибку кассы явно).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# pending — операция создана в aQsi, ждём фискализации;
# registered — касса пробила чек; failed — ошибка (сеть/касса/валидация);
# skipped — фискализация выключена (нет AQSI_* в env) — след для аудита.
FISCAL_STATUSES = ("pending", "registered", "failed", "skipped")


class FiscalReceipt(Base):
    __tablename__ = "fiscal_receipts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"))
    payment_id: Mapped[str | None] = mapped_column(String, ForeignKey("payments.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String, default="aqsi")
    # id асинхронной операции устройства в aQsi (ответ POST /v4/Receipts/process).
    operation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    # Текст последней ошибки — показывается кассиру для повтора.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
