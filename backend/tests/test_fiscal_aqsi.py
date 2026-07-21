"""Фискализация продаж POS через aQsi (54-ФЗ).

Инварианты:
- без AQSI_* фискализация выключена: чек в статусе skipped, продажа работает;
- при включённой кассе чек уходит в aQsi: тело собирается из серверных цен
  (копейки), тип оплаты 0/1 по методу, СНО и ставка из настроек;
- недоступная касса НЕ отменяет продажу: чек failed с текстом ошибки,
  повтор через /fiscal-receipts/{id}/retry добивает его;
- retry пробитого чека — 409.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Bouquet
from app.config import settings
from app.fiscal_models import FiscalReceipt
from app.inventory_models import Item
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Точка")
        db.add(store)
        await db.flush()
        db.add(Bouquet(title="Букет", status="window", amount=5000, sale_amount=5400, store_id=store.id))
        rose = Item(title="Роза", min_price=200, max_price=350)
        db.add(rose)
        await db.commit()
        bouquet_id = (
            await db.execute(select(Bouquet.id).where(Bouquet.title == "Букет"))
        ).scalar_one()
        return {"store_id": store.id, "bouquet_id": bouquet_id, "item_id": rose.id}


@pytest.fixture
def aqsi_enabled(monkeypatch):
    monkeypatch.setattr(settings, "aqsi_api_key", "test-key")
    monkeypatch.setattr(settings, "aqsi_device_id", 42)


async def _sale(client, token, seed, items=None, method="card"):
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 0},
        headers=_auth(token),
    )
    assert resp.status_code in (201, 409), resp.text  # смена может быть уже открыта
    return await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": items or [{"bouquetId": seed["bouquet_id"]}],
            "payment": {"method": method},
        },
        headers=_auth(token),
    )


async def test_sale_without_aqsi_config_is_skipped(client, worker_token, seed):
    resp = await _sale(client, worker_token, seed)
    assert resp.status_code == 201, resp.text
    fiscal = resp.json()["meta"]["fiscal"]
    assert fiscal["status"] == "skipped"
    assert fiscal["error"] is None


async def test_sale_sends_receipt_to_aqsi(client, worker_token, seed, aqsi_enabled, monkeypatch):
    captured: dict = {}

    async def fake_process(body):
        captured.update(body)
        return "op-123"

    from app.services import aqsi

    monkeypatch.setattr(aqsi, "process_receipt", fake_process)

    resp = await _sale(
        client, worker_token, seed,
        items=[{"inventoryItemId": seed["item_id"], "quantity": 3}],
        method="card",
    )
    assert resp.status_code == 201, resp.text
    fiscal = resp.json()["meta"]["fiscal"]
    assert fiscal["status"] == "pending"

    assert captured["deviceId"] == 42
    assert captured["typeId"] == 1  # приход
    pos = captured["positions"][0]["info"]
    assert pos["name"] == "Роза"
    assert pos["finalPrice"] == 35000  # копейки, серверная цена
    assert pos["baseQuantity"] == "3"
    assert captured["payments"] == [{"type": 1, "amount": 105000}]  # карта, 1050 ₽

    async with TestingSessionLocal() as db:
        row = (
            await db.execute(select(FiscalReceipt).where(FiscalReceipt.operation_id == "op-123"))
        ).scalar_one()
        assert row.status == "pending"


async def test_cash_sale_uses_cash_payment_type(client, worker_token, seed, aqsi_enabled, monkeypatch):
    captured: dict = {}

    async def fake_process(body):
        captured.update(body)
        return "op-cash"

    from app.services import aqsi

    monkeypatch.setattr(aqsi, "process_receipt", fake_process)

    resp = await _sale(client, worker_token, seed, method="cash")
    assert resp.status_code == 201, resp.text
    assert captured["payments"][0]["type"] == 0  # наличные


async def test_broken_cash_register_does_not_block_sale_and_retry_recovers(
    client, worker_token, seed, aqsi_enabled, monkeypatch
):
    from app.services import aqsi

    async def broken(body):
        raise RuntimeError("aQsi 503: касса недоступна")

    monkeypatch.setattr(aqsi, "process_receipt", broken)

    resp = await _sale(client, worker_token, seed)
    assert resp.status_code == 201, resp.text  # продажа прошла
    fiscal = resp.json()["meta"]["fiscal"]
    assert fiscal["status"] == "failed"
    assert "503" in fiscal["error"]

    # Касса ожила — повтор добивает чек.
    async def fixed(body):
        assert body["positions"], "retry должен пересобрать позиции заказа"
        return "op-retry"

    monkeypatch.setattr(aqsi, "process_receipt", fixed)
    resp = await client.post(
        f"/api/v1/pos/fiscal-receipts/{fiscal['id']}/retry",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["status"] == "pending"


async def test_retry_of_registered_receipt_is_409(client, worker_token, seed, aqsi_enabled):
    resp = await _sale(client, worker_token, seed)
    fiscal_id = resp.json()["meta"]["fiscal"]["id"]
    async with TestingSessionLocal() as db:
        row = (
            await db.execute(select(FiscalReceipt).where(FiscalReceipt.id == fiscal_id))
        ).scalar_one()
        row.status = "registered"
        await db.commit()

    resp = await client.post(
        f"/api/v1/pos/fiscal-receipts/{fiscal_id}/retry",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409
