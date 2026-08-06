from pydantic import BaseModel
from typing import Optional


class OrderItem(BaseModel):
    recipe_id: str
    title: str
    price: int = 0  # advisory only — server recomputes from Posiflora (anti-tamper)
    qty: int = 1
    swv_id: Optional[str] = None  # chosen quantity-variant (specification-with-variants)


class OrderCreate(BaseModel):
    customer_name: str
    phone: str
    city: str
    street: str
    house: str
    apartment: Optional[str] = None
    delivery_date: Optional[str] = None  # YYYY-MM-DD
    delivery_time: Optional[str] = None  # HH:MM start of 30-min slot
    comment: Optional[str] = None
    items: list[OrderItem]
    total_amount: int = 0  # advisory only — server recomputes the authoritative total
    promo_code: Optional[str] = None  # validated server-side (services/promo.py)


class OrderResponse(BaseModel):
    id: str
    posiflora_id: Optional[str]
    posiflora_doc_no: Optional[str]
    customer_name: str
    phone: str
    payment_status: str
    total_amount: int

    class Config:
        from_attributes = True


class PaymentInitRequest(BaseModel):
    order_id: str  # internal order id


class PaymentInitResponse(BaseModel):
    payment_url: str
    payment_id: str
    tbank_payment_id: Optional[str]


class TBankNotification(BaseModel):
    TerminalKey: str
    OrderId: str
    Success: bool
    Status: str
    PaymentId: int
    ErrorCode: str
    Amount: int
    CardId: Optional[int] = None
    Pan: Optional[str] = None
    ExpDate: Optional[str] = None
    Token: Optional[str] = None
