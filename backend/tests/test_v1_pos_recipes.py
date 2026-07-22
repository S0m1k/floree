"""«Собрать букет» по рецепту + оплата заказа из кассы (/v1/pos).

Инварианты:
- рецепты отдают цену точки (override точки важнее общей);
- сборка ставит букет на витрину с серверной ценой и списывает компоненты
  рецепта (если состав заполнен); рецепт без цены — 400;
- оплата заказа из кассы требует открытой смены, гасит «К оплате» (полная
  оплата — payment_status=paid), нал попадает в ожидаемую кассу смены;
- переплата — 400, повторная оплата оплаченного — 409.
"""

import pytest_asyncio
from decimal import Decimal
from sqlalchemy import select

from app.catalog_models import (
    Bouquet,
    Specification,
    SpecificationComposition,
    SpecificationVariant,
    SpecificationVariantPrice,
    SpecificationWithVariants,
    Store,
)
from app.inventory_models import Item, StockBalance
from app.models import Order, OrderItem
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Точка")
        other_store = Store(title="Другая")
        db.add_all([store, other_store])
        await db.flush()

        spec = Specification(title="Нежность")
        variant = SpecificationVariant(title="9 штук")
        rose = Item(title="Роза", min_price=200, max_price=350)
        db.add_all([spec, variant, rose])
        await db.flush()

        swv = SpecificationWithVariants(specification_id=spec.id, variant_id=variant.id)
        db.add(swv)
        await db.flush()
        # Общая цена 4500, override нашей точки 5000.
        db.add(SpecificationVariantPrice(spec_with_variants_id=swv.id, price_value=4500, store_id=None))
        db.add(SpecificationVariantPrice(spec_with_variants_id=swv.id, price_value=5000, store_id=store.id))
        # Состав: 9 роз.
        db.add(SpecificationComposition(spec_with_variants_id=swv.id, item_id=rose.id, quantity=9))
        await db.commit()
        return {
            "store_id": store.id,
            "other_store_id": other_store.id,
            "swv_id": swv.id,
            "rose_id": rose.id,
        }


async def _open_shift(client, token, store_id):
    resp = await client.post(
        "/api/v1/pos/shifts",
        json={"storeId": store_id, "countedCash": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text


async def test_recipes_return_store_price(client, worker_token, seed):
    resp = await client.get(
        f"/api/v1/pos/recipes?filter[store]={seed['store_id']}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["data"]
    assert [r["attributes"]["title"] for r in rows] == ["Нежность"]
    assert rows[0]["attributes"]["price"] == 5000  # override точки
    assert rows[0]["attributes"]["variant"] == "9 штук"

    resp = await client.get(
        f"/api/v1/pos/recipes?filter[store]={seed['other_store_id']}", headers=_auth(worker_token)
    )
    assert resp.json()["data"][0]["attributes"]["price"] == 4500  # общая цена


async def test_assemble_bouquet_puts_on_window_and_writes_off(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/pos/bouquets",
        json={"storeId": seed["store_id"], "swvId": seed["swv_id"]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    attrs = resp.json()["data"]["attributes"]
    assert attrs["title"] == "Нежность (9 штук)"
    assert attrs["saleAmount"] == 5000
    assert attrs["status"] == "window"

    async with TestingSessionLocal() as db:
        balance = (
            await db.execute(select(StockBalance).where(StockBalance.item_id == seed["rose_id"]))
        ).scalar_one()
        assert Decimal(str(balance.quantity)) == Decimal(-9)  # 9 роз списано (с нуля — в минус)


async def test_assembled_bouquet_sellable_via_pos(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/pos/bouquets",
        json={"storeId": seed["store_id"], "swvId": seed["swv_id"]},
        headers=_auth(worker_token),
    )
    bouquet_id = resp.json()["data"]["id"]

    await _open_shift(client, worker_token, seed["store_id"])
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
    assert resp.json()["meta"]["total"] == 5000


async def test_order_payment_from_pos(client, worker_token, seed):
    # Заказ на 5000 с реальной строкой состава (иначе «К оплате» = 0).
    async with TestingSessionLocal() as db:
        order = Order(
            customer_name="Тест", phone="", address="", bouquet_ids="[]",
            total_amount=5000, store_id=seed["store_id"], status="new",
            payment_status="pending",
        )
        db.add(order)
        await db.flush()
        db.add(OrderItem(
            order_id=order.id, parent_id=None, kind="item",
            inventory_item_id=seed["rose_id"], title="Роза",
            unit_price=5000, quantity=1, measure="шт",
        ))
        await db.commit()
        order_id = order.id

    # Без смены — 409.
    resp = await client.post(
        f"/api/v1/pos/orders/{order_id}/payments",
        json={"method": "cash"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409

    await _open_shift(client, worker_token, seed["store_id"])

    # Частичная оплата 2000 налом.
    resp = await client.post(
        f"/api/v1/pos/orders/{order_id}/payments",
        json={"method": "cash", "amount": 2000},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["meta"]["remaining"] == 3000
    assert resp.json()["meta"]["paid"] is False

    # Нал попал в ожидаемую кассу смены.
    resp = await client.get(
        f"/api/v1/pos/context?filter[store]={seed['store_id']}", headers=_auth(worker_token)
    )
    assert resp.json()["meta"]["expectedCash"] == 2000

    # Переплата — 400.
    resp = await client.post(
        f"/api/v1/pos/orders/{order_id}/payments",
        json={"method": "card", "amount": 9999},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400

    # Добить остаток целиком (без amount).
    resp = await client.post(
        f"/api/v1/pos/orders/{order_id}/payments",
        json={"method": "card"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["meta"]["paid"] is True

    async with TestingSessionLocal() as db:
        fresh = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert fresh.payment_status == "paid"

    # Оплаченный заказ повторно не оплачивается.
    resp = await client.post(
        f"/api/v1/pos/orders/{order_id}/payments",
        json={"method": "cash"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409
