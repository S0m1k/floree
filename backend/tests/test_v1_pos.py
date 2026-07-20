"""POS-терминал /v1/pos — смены, продажа, касса.

Инварианты под тестом:
- продажа невозможна без открытой смены (409) и не принимает цены с клиента —
  сумма считается из каталога (bouquet.sale_amount / розничная цена товара);
- продажа создаёт сразу завершённый оплаченный заказ с источником «Терминал»
  (code=terminal), привязанный к смене; проданный букет уходит в purchased;
- ожидаемая касса = opening_cash + нал-продажи + внесения − изъятия;
  расхождения открытия/закрытия считаются от неё;
- изъятие не может превысить ожидаемый нал; всё требует авторизации (401).
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Bouquet
from app.inventory_models import Item
from app.models import Order, Payment
from app.staff_models import Shift
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском")
        db.add(store)
        await db.flush()
        bouquet = Bouquet(
            title="Букет с пионами",
            status="window",
            amount=5000,
            sale_amount=5400,
            store_id=store.id,
        )
        rose = Item(title="Роза Кения 40 см", min_price=200, max_price=350)
        db.add_all([bouquet, rose])
        await db.commit()
        return {"store_id": store.id, "bouquet_id": bouquet.id, "item_id": rose.id}


async def _open_shift(client, token, store_id, counted=1000) -> str:
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": store_id, "countedCash": counted},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


# ---------- auth ----------


async def test_pos_requires_auth(client, seed):
    resp = await client.get(f"/api/v1/pos/context?filter[store]={seed['store_id']}")
    assert resp.status_code == 401


# ---------- каталог кассы ----------


async def test_products_lists_sellable_bouquets_and_priced_items(client, worker_token, seed):
    async with TestingSessionLocal() as db:
        from app.catalog_models import Bouquet as B

        db.add(B(title="Проданный", status="purchased", sale_amount=100, store_id=seed["store_id"]))
        await db.commit()

    resp = await client.get(
        f"/api/v1/pos/products?filter[store]={seed['store_id']}",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Продаваемый букет попал, проданный — нет.
    assert [b["title"] for b in body["bouquets"]] == ["Букет с пионами"]
    assert body["bouquets"][0]["price"] == 5400
    assert body["bouquets"][0]["createdAt"]
    # Товар с розничной ценой; поле фото присутствует (может быть null).
    rose = next(i for i in body["items"] if i["title"] == "Роза Кения 40 см")
    assert rose["price"] == 350
    assert "photo" in rose


# ---------- смены ----------


async def test_open_shift_first_discrepancy_vs_zero(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 500},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    attrs = resp.json()["data"]["attributes"]
    assert attrs["openingCash"] == 500
    assert attrs["openDiscrepancy"] == 500  # первая смена: ожидалось 0

    # Вторая открытая смена на той же точке — 409.
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 0},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409


async def test_close_shift_discrepancy_and_next_open_base(client, worker_token, seed):
    shift_id = await _open_shift(client, worker_token, seed["store_id"], counted=1000)

    # Закрываем с недостачей 100: ожидаемая касса 1000 (продаж не было).
    resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        json={"countedCash": 900},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["meta"]["expectedCash"] == 1000
    assert body["data"]["attributes"]["closeDiscrepancy"] == -100

    # Повторное закрытие — 409.
    resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        json={"countedCash": 900},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409

    # Следующая смена: ожидаемая база открытия = closing_cash (900).
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 900},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["attributes"]["openDiscrepancy"] == 0


async def test_context_reports_expected_cash(client, worker_token, seed):
    # Нет смены: expectedOpeningCash = 0, data = null.
    resp = await client.get(
        f"/api/v1/pos/context?filter[store]={seed['store_id']}",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    assert resp.json()["data"] is None
    assert resp.json()["meta"]["expectedOpeningCash"] == 0

    await _open_shift(client, worker_token, seed["store_id"], counted=1000)
    resp = await client.get(
        f"/api/v1/pos/context?filter[store]={seed['store_id']}",
        headers=_auth(worker_token),
    )
    meta = resp.json()["meta"]
    assert meta["expectedCash"] == 1000
    assert meta["salesCount"] == 0


# ---------- продажа ----------


async def test_sale_requires_open_shift(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"bouquetId": seed["bouquet_id"]}],
            "payment": {"method": "cash"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409


async def test_cash_sale_bouquet_server_priced(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=1000)

    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            # Клиентская «цена» игнорируется — суммы только серверные.
            "items": [{"bouquetId": seed["bouquet_id"], "price": 1}],
            "payment": {"method": "cash", "cashReceived": 6000},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["meta"]["total"] == 5400
    assert body["meta"]["change"] == 600
    attrs = body["data"]["attributes"]
    assert attrs["status"] == "completed"
    assert attrs["totalAmount"] == 5400
    assert attrs["paymentsAmount"] == 5400

    async with TestingSessionLocal() as db:
        order = (
            await db.execute(select(Order).where(Order.id == body["data"]["id"]))
        ).scalar_one()
        assert order.shift_id is not None
        assert order.payment_status == "paid"
        # Источник — «Терминал», создан/подхвачен по коду.
        from app.dictionary_models import CustomerDealSource

        source = (
            await db.execute(
                select(CustomerDealSource).where(CustomerDealSource.id == order.source_id)
            )
        ).scalar_one()
        assert source.code == "terminal"
        # Букет продан.
        bouquet = (
            await db.execute(select(Bouquet).where(Bouquet.id == seed["bouquet_id"]))
        ).scalar_one()
        assert bouquet.status == "purchased"


async def test_sold_bouquet_cannot_be_sold_twice(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=0)
    sale = {
        "storeId": seed["store_id"],
        "items": [{"bouquetId": seed["bouquet_id"]}],
        "payment": {"method": "card"},
    }
    resp = await client.post("/api/v1/pos/sales", json=sale, headers=_auth(worker_token))
    assert resp.status_code == 201
    resp = await client.post("/api/v1/pos/sales", json=sale, headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_cash_received_below_total_rejected(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=0)
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"bouquetId": seed["bouquet_id"]}],
            "payment": {"method": "cash", "cashReceived": 100},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_item_sale_uses_retail_price_and_qty(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=0)
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"inventoryItemId": seed["item_id"], "quantity": 3}],
            "payment": {"method": "card"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["meta"]["total"] == 1050  # 350 (max_price) × 3


# ---------- касса и ожидаемый нал ----------


async def test_expected_cash_flows_through_sales_and_ops(client, worker_token, seed):
    shift_id = await _open_shift(client, worker_token, seed["store_id"], counted=1000)

    # Нал-продажа 5400.
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"bouquetId": seed["bouquet_id"]}],
            "payment": {"method": "cash"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201

    # Внесение 500, изъятие 2000.
    for op, amount in (("in", 500), ("out", 2000)):
        resp = await client.post(
            "/api/v1/pos/cash-operations",
            json={"storeId": seed["store_id"], "type": op, "amount": amount},
            headers=_auth(worker_token),
        )
        assert resp.status_code == 201, resp.text

    resp = await client.get(
        f"/api/v1/pos/context?filter[store]={seed['store_id']}",
        headers=_auth(worker_token),
    )
    meta = resp.json()["meta"]
    assert meta["expectedCash"] == 1000 + 5400 + 500 - 2000
    assert meta["salesCount"] == 1
    assert meta["salesTotal"] == 5400

    # Закрытие точно в ноль.
    resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        json={"countedCash": 4900},
        headers=_auth(worker_token),
    )
    assert resp.json()["data"]["attributes"]["closeDiscrepancy"] == 0


async def test_card_sale_does_not_touch_cash(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=1000)
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"bouquetId": seed["bouquet_id"]}],
            "payment": {"method": "card"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201
    resp = await client.get(
        f"/api/v1/pos/context?filter[store]={seed['store_id']}",
        headers=_auth(worker_token),
    )
    assert resp.json()["meta"]["expectedCash"] == 1000


async def test_withdrawal_cannot_exceed_expected_cash(client, worker_token, seed):
    await _open_shift(client, worker_token, seed["store_id"], counted=100)
    resp = await client.post(
        "/api/v1/pos/cash-operations",
        json={"storeId": seed["store_id"], "type": "out", "amount": 500},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
