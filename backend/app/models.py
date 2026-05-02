import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


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
    total_amount: Mapped[int] = mapped_column(Integer, default=0)  # rubles
    status: Mapped[str] = mapped_column(String, default="pending")  # pending, paid, failed, cancelled
    bouquet_ids: Mapped[str] = mapped_column(Text)  # JSON array of bouquet UUIDs
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="order")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String, ForeignKey("orders.id"))
    tbank_payment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    tbank_order_id: Mapped[str] = mapped_column(String)  # OrderId sent to T-Bank
    amount: Mapped[int] = mapped_column(Integer)  # rubles
    status: Mapped[str] = mapped_column(String, default="INIT")  # INIT, NEW, CONFIRMED, CANCELLED, REJECTED
    payment_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="payments")
