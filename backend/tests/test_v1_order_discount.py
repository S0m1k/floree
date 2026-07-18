"""Order-level and per-line discount/markup + оплата бонусами — the order card
«Продукты» tab итоговая панель (docs/posiflora/admin-map.md §2.2.1).

The money invariants under test:
- the client sends only kind/target/mode/value/reason; the resulting money
  amount is always computed server-side from the target's own base and can
  never exceed it (memory payment-price-vuln);
- «в т.ч. на цветы/на букеты/на заказ» breakdown matches kind='item' vs
  kind='bouquet' vs order-level;
- bonus payment can never exceed the customer's balance or «К оплате», and a
  repeat call replaces rather than stacks the previous charge.
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Customer, Bouquet, CustomerBonusHistory
from app.dictionary_models import CustomerDealSource, DiscountReason
from app.inventory_models import Item
from app.models import Order
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    """A store, a showcase bouquet (5000 ₽), a priced good, a discount reason
    and a customer with a 300-bonus balance."""
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском")
        db.add(store)
        await db.flush()
        bouquet = Bouquet(
            title="Букет 36993628",
            status="window",
            amount=4000,
            sale_amount=5000,
            store_id=store.id,
        )
        rose = Item(title="Роза Кения 40 см", min_price=200, max_price=1000)
        source = CustomerDealSource(title="Телефон")
        reason = DiscountReason(title="Постоянный клиент")
        customer = Customer(name="Ирина", phone="+79990001122", bonus_balance=300)
        db.add_all([bouquet, rose, source, reason, customer])
        await db.commit()
        return {
            "store_id": store.id,
            "bouquet_id": bouquet.id,
            "item_id": rose.id,
            "source_id": source.id,
            "reason_id": reason.id,
            "customer_id": customer.id,
        }


async def _create_order(client, token, seed, with_customer=False) -> str:
    rels = {
        "store": {"data": {"type": "stores", "id": seed["store_id"]}},
        "source": {"data": {"type": "order-sources", "id": seed["source_id"]}},
    }
    if with_customer:
        rels["customer"] = {"data": {"type": "customers", "id": seed["customer_id"]}}
    resp = await client.post(
        "/api/v1/orders",
        json={"data": {"type": "orders", "attributes": {"delivery": "pickup"}, "relationships": rels}},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _add_bouquet(client, token, order_id, bouquet_id) -> str:
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": bouquet_id},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"][0]["id"]


async def _add_item(client, token, order_id, item_id, qty=1) -> str:
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"inventoryItemId": item_id, "quantity": qty},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    rows = resp.json()["data"]
    return next(r["id"] for r in rows if r["attributes"]["kind"] == "item")


# ---------- auth ----------

async def test_discount_and_bonus_endpoints_require_auth(client, seed):
    assert (await client.put("/api/v1/orders/x/discount", json={})).status_code == 401
    assert (await client.delete("/api/v1/orders/x/discount")).status_code == 401
    assert (await client.put("/api/v1/orders/x/bonus-payment", json={})).status_code == 401


# ---------- order-level discount/markup ----------

async def test_order_discount_percent(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "percent", "value": 10, "reasonId": seed["reason_id"]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["discount"] == 500.0  # 10% of 5000
    assert totals["discountBreakdown"] == {"flowers": 0.0, "bouquets": 0.0, "order": 500.0}
    assert totals["orderDiscountPercent"] == 10.0
    assert totals["orderDiscountReasonId"] == seed["reason_id"]
    assert totals["grandTotal"] == 4500.0
    assert totals["toPay"] == 4500.0

    async with TestingSessionLocal() as db:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert float(order.total_amount) == 4500.0
        assert float(order.discount_total) == 500.0


async def test_order_markup_amount(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "markup", "target": "order", "mode": "amount", "value": 300},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["markup"] == 300.0
    assert totals["markupBreakdown"]["order"] == 300.0
    assert totals["orderMarkupPercent"] is None
    assert totals["grandTotal"] == 5300.0


async def test_order_discount_replaces_not_stacks(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])
    await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "amount", "value": 400},
        headers=_auth(worker_token),
    )
    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "amount", "value": 700},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["meta"]["totals"]["discount"] == 700.0


async def test_order_discount_clears(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])
    await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "amount", "value": 400, "reasonId": seed["reason_id"]},
        headers=_auth(worker_token),
    )
    resp = await client.delete(
        f"/api/v1/orders/{order_id}/discount?target=order&kind=discount",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["discount"] == 0.0
    assert totals["orderDiscountReasonId"] is None
    assert totals["grandTotal"] == 5000.0


# ---------- per-line discount/markup + breakdown ----------

async def test_item_discount_flowers_breakdown(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    item_id = await _add_item(client, worker_token, order_id, seed["item_id"], qty=2)  # 2000 ₽

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "item", "itemId": item_id, "mode": "amount", "value": 200},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["discount"] == 200.0
    assert totals["discountBreakdown"] == {"flowers": 200.0, "bouquets": 0.0, "order": 0.0}
    assert totals["grandTotal"] == 1800.0
    row = next(r for r in resp.json()["data"] if r["id"] == item_id)
    assert row["attributes"]["discount"] == 200.0
    assert row["attributes"]["sum"] == 1800.0


async def test_item_markup_bouquets_breakdown(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    bouquet_row_id = await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "markup", "target": "item", "itemId": bouquet_row_id, "mode": "percent", "value": 20},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["markup"] == 1000.0  # 20% of the bouquet's own 5000 ₽ base
    assert totals["markupBreakdown"] == {"flowers": 0.0, "bouquets": 1000.0, "order": 0.0}


async def test_item_discount_exceeding_base_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    item_id = await _add_item(client, worker_token, order_id, seed["item_id"], qty=1)  # 1000 ₽

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "item", "itemId": item_id, "mode": "amount", "value": 1001},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "баз" in resp.json()["detail"]


async def test_discount_percent_over_100_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "percent", "value": 150},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_discount_unknown_reason_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "amount", "value": 100, "reasonId": "no-such-reason"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_discount_item_not_in_order_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "item", "itemId": "no-such-item", "mode": "amount", "value": 10},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_discount_on_terminal_order_is_409(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])
    await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "cancelled"}}},
        headers=_auth(worker_token),
    )

    put_resp = await client.put(
        f"/api/v1/orders/{order_id}/discount",
        json={"kind": "discount", "target": "order", "mode": "amount", "value": 10},
        headers=_auth(worker_token),
    )
    assert put_resp.status_code == 409

    delete_resp = await client.delete(
        f"/api/v1/orders/{order_id}/discount?target=order&kind=discount",
        headers=_auth(worker_token),
    )
    assert delete_resp.status_code == 409


# ---------- оплата бонусами ----------

async def test_bonus_payment_exceeding_balance_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=True)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 301},  # balance is 300
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "баланс" in resp.json()["detail"]


async def test_bonus_payment_exceeding_to_pay_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=True)
    # No composition added — grandTotal/«к оплате» is 0, while the customer's
    # bonus balance (300) is nonzero, so this only trips the «к оплате» cap.
    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 10},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "оплате" in resp.json()["detail"]


async def test_bonus_payment_reduces_balance_and_writes_history(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=True)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])  # 5000 ₽

    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 120},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    totals = resp.json()["meta"]["totals"]
    assert totals["bonusPaid"] == 120.0
    assert totals["toPay"] == 4880.0

    async with TestingSessionLocal() as db:
        customer = (
            await db.execute(select(Customer).where(Customer.id == seed["customer_id"]))
        ).scalar_one()
        assert customer.bonus_balance == 180  # 300 - 120

        history = (
            await db.execute(
                select(CustomerBonusHistory).where(CustomerBonusHistory.customer_id == seed["customer_id"])
            )
        ).scalars().all()
        assert len(history) == 1
        assert history[0].amount == -120
        assert history[0].order_id == order_id


async def test_bonus_payment_repeat_call_replaces_not_stacks(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=True)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])  # 5000 ₽

    await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 100},
        headers=_auth(worker_token),
    )
    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 250},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text

    async with TestingSessionLocal() as db:
        customer = (
            await db.execute(select(Customer).where(Customer.id == seed["customer_id"]))
        ).scalar_one()
        # 300 - 250, never 300 - 100 - 250
        assert customer.bonus_balance == 50


async def test_bonus_payment_zero_returns_bonuses(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=True)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 150},
        headers=_auth(worker_token),
    )
    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 0},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["meta"]["totals"]["bonusPaid"] == 0.0

    async with TestingSessionLocal() as db:
        customer = (
            await db.execute(select(Customer).where(Customer.id == seed["customer_id"]))
        ).scalar_one()
        assert customer.bonus_balance == 300


async def test_bonus_payment_without_customer_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed, with_customer=False)
    await _add_bouquet(client, worker_token, order_id, seed["bouquet_id"])

    resp = await client.put(
        f"/api/v1/orders/{order_id}/bonus-payment",
        json={"amount": 10},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
