"""Складские остатки — /v1/stock + списание при продаже POS.

Инварианты:
- продажа товара в POS пишет sale-движение −qty и уменьшает снэпшот остатка
  (в той же транзакции, что и продажа);
- инвентаризация создаёт проведённый акт и correction-движения до фактических
  количеств; повторная инвентаризация без расхождений движений не пишет;
- обзор остатков считает деньги (остаток × себестоимость / розница) и итоги;
- остаток может уходить в минус (продажа не блокируется учётом);
- всё требует авторизации (401).
"""

import pytest_asyncio
from decimal import Decimal
from sqlalchemy import select

from app.catalog_models import Store, Bouquet
from app.inventory_models import InventoryAct, StockBalance, StockMovement
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
        rose = Item(title="Роза Кения", min_price=200, max_price=350)
        tulip = Item(title="Тюльпан", min_price=80, max_price=120)
        service = Item(title="Доставка", item_type="service", max_price=500)
        db.add_all([rose, tulip, service])
        await db.commit()
        return {"store_id": store.id, "rose_id": rose.id, "tulip_id": tulip.id}


async def _inventory(client, token, store_id, lines):
    return await client.post(
        "/api/v1/stock/inventory",
        json={"storeId": store_id, "lines": lines},
        headers=_auth(token),
    )


async def test_stock_requires_auth(client, seed):
    resp = await client.get(f"/api/v1/stock?filter[store]={seed['store_id']}")
    assert resp.status_code == 401


async def test_inventory_sets_balances_and_posts_act(client, worker_token, seed):
    resp = await _inventory(
        client, worker_token, seed["store_id"],
        [
            {"itemId": seed["rose_id"], "actualQty": 25},
            {"itemId": seed["tulip_id"], "actualQty": 10},
        ],
    )
    assert resp.status_code == 201, resp.text
    attrs = resp.json()["data"]["attributes"]
    assert attrs["status"] == "posted"
    assert attrs["itemsCount"] == 2
    # Финрезультат по рознице: 25×350 + 10×120.
    assert attrs["financialResult"] == 25 * 350 + 10 * 120

    resp = await client.get(
        f"/api/v1/stock?filter[store]={seed['store_id']}", headers=_auth(worker_token)
    )
    rows = {r["attributes"]["title"]: r["attributes"] for r in resp.json()["data"]}
    assert rows["Роза Кения"]["quantity"] == 25
    assert rows["Роза Кения"]["retailSum"] == 25 * 350
    assert "Доставка" not in rows  # услуги не складируются
    assert resp.json()["meta"]["totals"]["qty"] == 35


async def test_pos_item_sale_writes_off_stock(client, worker_token, seed):
    await _inventory(client, worker_token, seed["store_id"], [{"itemId": seed["rose_id"], "actualQty": 10}])

    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 0},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"inventoryItemId": seed["rose_id"], "quantity": 3}],
            "payment": {"method": "card"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    order_id = resp.json()["data"]["id"]

    async with TestingSessionLocal() as db:
        movement = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.order_id == order_id, StockMovement.reason == "sale"
                )
            )
        ).scalar_one()
        assert Decimal(str(movement.quantity)) == Decimal(-3)
        balance = (
            await db.execute(
                select(StockBalance).where(StockBalance.item_id == seed["rose_id"])
            )
        ).scalar_one()
        assert Decimal(str(balance.quantity)) == Decimal(7)


async def test_sale_without_stock_goes_negative_but_succeeds(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 0},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"inventoryItemId": seed["tulip_id"], "quantity": 2}],
            "payment": {"method": "cash"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text

    resp = await client.get(
        f"/api/v1/stock?filter[store]={seed['store_id']}", headers=_auth(worker_token)
    )
    rows = {r["attributes"]["title"]: r["attributes"] for r in resp.json()["data"]}
    assert rows["Тюльпан"]["quantity"] == -2


async def test_repeat_inventory_without_diff_writes_no_movements(client, worker_token, seed):
    await _inventory(client, worker_token, seed["store_id"], [{"itemId": seed["rose_id"], "actualQty": 5}])
    resp = await _inventory(client, worker_token, seed["store_id"], [{"itemId": seed["rose_id"], "actualQty": 5}])
    assert resp.status_code == 201
    assert resp.json()["data"]["attributes"]["financialResult"] == 0

    async with TestingSessionLocal() as db:
        movements = (
            (await db.execute(select(StockMovement).where(StockMovement.item_id == seed["rose_id"])))
            .scalars()
            .all()
        )
        assert len(movements) == 1  # только первая инвентаризация
        acts = (await db.execute(select(InventoryAct))).scalars().all()
        assert len(acts) == 2  # но оба акта проведены


async def test_bouquet_sale_does_not_touch_stock(client, worker_token, seed):
    async with TestingSessionLocal() as db:
        bouquet = Bouquet(title="Букет", status="window", sale_amount=5400, store_id=seed["store_id"])
        db.add(bouquet)
        await db.commit()
        bouquet_id = bouquet.id

    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": seed["store_id"], "countedCash": 0},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201
    resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "storeId": seed["store_id"],
            "items": [{"bouquetId": bouquet_id}],
            "payment": {"method": "card"},
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text

    async with TestingSessionLocal() as db:
        movements = (await db.execute(select(StockMovement))).scalars().all()
        assert movements == []  # состав букета не смоделирован — списания нет
