"""Клиент облака aQsi — фискализация чеков продаж POS (54-ФЗ).

Чек создаётся асинхронной операцией устройства: POST {aqsi_api_url}/v4/Receipts/process
с заголовком `x-client-key: Application <API-ключ>` возвращает operationId, сама
фискализация происходит на смарт-терминале aQsi. Статус — GET /v4/Operations/{id}.

Значения-константы — стандартные теги ФФД:
- признак расчёта (1054): 1 = приход;
- признак способа расчёта (1214): 4 = полный расчёт;
- предмет расчёта (1212): 1 = товар;
- код единицы (2108, ФФД 1.2): 0 = штуки;
- тип оплаты aQsi: 0 = наличные, 1 = безналичные.
СНО (1055) и ставка НДС берутся из настроек (aqsi_tax_system_code / aqsi_vat_rate_id).
"""

import logging
from decimal import Decimal

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DOC_TYPE_INCOME = 1  # приход
CALCULATION_TYPE_FULL = 4  # полный расчёт
CALCULATION_SUBJECT_GOODS = 1  # товар
UNIT_PIECE = 0  # штуки
PAYMENT_TYPE_BY_METHOD = {"cash": 0, "card": 1}

REQUEST_TIMEOUT_SECONDS = 15


def is_enabled() -> bool:
    """Фискализация активна, только когда задан ключ и id кассы."""
    return bool(settings.aqsi_api_key and settings.aqsi_device_id)


def _headers() -> dict:
    return {"x-client-key": f"Application {settings.aqsi_api_key}"}


def _kopecks(amount: Decimal | float | int) -> int:
    return int(round(float(amount) * 100))


def _qty_str(quantity) -> str:
    """Количество как строка с точкой, без хвостовых нулей ('3.000' → '3')."""
    return format(Decimal(str(quantity)).normalize(), "f")


def build_receipt_body(
    *,
    items: list[dict],
    method: str,
    total: Decimal,
    customer_email: str | None = None,
    cashier_name: str | None = None,
) -> dict:
    """Тело ReceiptReqV3 для продажи. `items`: [{title, unit_price, quantity}]."""
    positions = [
        {
            "info": {
                "name": str(item["title"])[:128],
                "finalPrice": _kopecks(item["unit_price"]),
                "baseQuantity": _qty_str(item["quantity"]),
                "calculationTypeId": CALCULATION_TYPE_FULL,
                "calculationSubjectId": CALCULATION_SUBJECT_GOODS,
                "taxRateId": settings.aqsi_vat_rate_id,
                "quantityUnitId": UNIT_PIECE,
            }
        }
        for item in items
    ]
    info: dict = {"taxSystemCode": settings.aqsi_tax_system_code}
    if customer_email:
        info["customerInfo"] = {"email": customer_email}
    if cashier_name:
        info["cashierInfo"] = {"name": cashier_name}

    return {
        "deviceId": settings.aqsi_device_id,
        "typeId": DOC_TYPE_INCOME,
        "info": info,
        "positions": positions,
        "payments": [
            {"type": PAYMENT_TYPE_BY_METHOD[method], "amount": _kopecks(total)}
        ],
        "ignoreItemCodeCheck": True,
        "skipPrinting": False,
    }


async def process_receipt(body: dict) -> str:
    """Создать операцию чека, вернуть operationId. Исключения — наверх:
    вызывающий код переводит чек в failed, продажа не блокируется."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{settings.aqsi_api_url}/v4/Receipts/process",
            json=body,
            headers=_headers(),
        )
    if resp.status_code != 200:
        raise RuntimeError(f"aQsi {resp.status_code}: {resp.text[:300]}")
    operation_id = (resp.json() or {}).get("operationId")
    if not operation_id:
        raise RuntimeError(f"aQsi: нет operationId в ответе: {resp.text[:300]}")
    return str(operation_id)


async def get_operation(operation_id: str) -> dict:
    """Статус асинхронной операции устройства (GET /v4/Operations/{id})."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{settings.aqsi_api_url}/v4/Operations/{operation_id}",
            headers=_headers(),
        )
    if resp.status_code != 200:
        raise RuntimeError(f"aQsi {resp.status_code}: {resp.text[:300]}")
    return resp.json() or {}
