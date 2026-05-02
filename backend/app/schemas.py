from pydantic import BaseModel
from typing import Optional


class OrderCreate(BaseModel):
    customer_name: str
    phone: str
    address: str
    comment: Optional[str] = None
    due_time: Optional[str] = None  # ISO datetime string with tz offset
    bouquet_ids: list[str]
    total_amount: int  # rubles


class OrderResponse(BaseModel):
    id: str
    posiflora_id: Optional[str]
    posiflora_doc_no: Optional[str]
    customer_name: str
    phone: str
    status: str
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
