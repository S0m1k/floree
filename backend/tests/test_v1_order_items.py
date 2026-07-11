"""Order composition + advances — the order card «Продукты» tab
(docs/posiflora/admin-map.md §2.2.1).

The money invariants under test:
- prices are NEVER accepted from the client: adding a line sends only the id of
  the source; the server reads the price from its own catalog (a client-supplied
  price in the body is ignored);
- deleting a line recomputes order.total_amount;
- legacy ETL/checkout orders (bouquet_ids JSON, no order_items rows) expose a
  read-only composition with totals from total_amount;
- a manual advance lowers «К оплате» and can never exceed it;
- terminal orders are read-only (409); everything requires auth (401).
"""

import json

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Customer, Bouquet
from app.dictionary_models import CustomerDealSource
from app.inventory_models import Item
from app.models import Order
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    """A store, a showcase bouquet (5400 ₽), a priced good and an unpriced one."""
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском")
        db.add(store)
        await db.flush()
        bouquet = Bouquet(
            title="Букет 36993628",
            status="window",
            amount=5000,
            sale_amount=5400,
            store_id=store.id,
        )
        rose = Item(title="Роза Кения 40 см", min_price=200, max_price=350)
        no_price = Item(title="Товар без цены", min_price=0, max_price=0)
        source = CustomerDealSource(title="Телефон")
        db.add_all([bouquet, rose, no_price, source])
        await db.commit()
        return {
            "store_id": store.id,
            "bouquet_id": bouquet.id,
            "item_id": rose.id,
            "no_price_item_id": no_price.id,
            "source_id": source.id,
        }


async def _create_order(client, token, seed) -> str:
    resp = await client.post(
        "/api/v1/orders",
        json={
            "data": {
                "type": "orders",
                "attributes": {"delivery": "pickup"},
                "relationships": {
                    "store": {"data": {"type": "stores", "id": seed["store_id"]}},
                    "source": {"data": {"type": "order-sources", "id": seed["source_id"]}},
                },
            }
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


# ---------- auth ----------

async def test_items_endpoints_require_auth(client, seed):
    assert (await client.get("/api/v1/orders/x/items")).status_code == 401
    assert (await client.post("/api/v1/orders/x/items", json={})).status_code == 401
    assert (await client.delete("/api/v1/orders/x/items/y")).status_code == 401
    assert (await client.post("/api/v1/orders/x/payments", json={})).status_code == 401
    assert (await client.get("/api/v1/orders/x/payments")).status_code == 401


# ---------- adding lines: server-owned prices ----------

async def test_add_bouquet_uses_server_price_and_ignores_client_price(
    client, worker_token, seed
):
    order_id = await _create_order(client, worker_token, seed)
    # A tampered body: the client "offers" 1 ₽. Only bouquetId may be honored.
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"], "price": 1, "unitPrice": 1, "amount": 1},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    rows = body["data"]
    assert len(rows) == 1
    a = rows[0]["attributes"]
    assert a["kind"] == "bouquet"
    assert a["title"] == "Букет - Букет 36993628"
    assert a["unitPrice"] == 5400.0  # bouquet.sale_amount, not the client's 1 ₽
    assert a["sum"] == 5400.0
    totals = body["meta"]["totals"]
    assert totals["itemsTotal"] == 5400.0
    assert totals["grandTotal"] == 5400.0
    assert totals["toPay"] == 5400.0
    assert totals["bouquetsCount"] == 1

    # order.total_amount is recomputed server-side.
    async with TestingSessionLocal() as db:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert float(order.total_amount) == 5400.0


async def test_add_inventory_item_with_quantity(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"inventoryItemId": seed["item_id"], "quantity": 2},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    a = body["data"][0]["attributes"]
    assert a["kind"] == "item"
    assert a["title"] == "Роза Кения 40 см"
    assert a["unitPrice"] == 350.0  # server-side retail price (max_price)
    assert a["quantity"] == 2.0
    assert a["measure"] == "Штука"
    assert a["sum"] == 700.0
    totals = body["meta"]["totals"]
    assert totals["itemsTotal"] == 700.0
    assert totals["productsCount"] == 2.0
    assert totals["bouquetsCount"] == 0


async def test_add_item_without_retail_price_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"inventoryItemId": seed["no_price_item_id"], "quantity": 1},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "розничной цены" in resp.json()["detail"]


async def test_add_item_with_bad_quantity_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"inventoryItemId": seed["item_id"], "quantity": -3},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_add_without_source_id_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items", json={}, headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_add_unknown_bouquet_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": "no-such-bouquet"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


# ---------- deleting lines ----------

async def test_delete_item_recalculates_total(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    added = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"inventoryItemId": seed["item_id"], "quantity": 2},
        headers=_auth(worker_token),
    )
    rows = added.json()["data"]
    assert added.json()["meta"]["totals"]["grandTotal"] == 6100.0
    item_row = next(r for r in rows if r["attributes"]["kind"] == "item")

    resp = await client.delete(
        f"/api/v1/orders/{order_id}/items/{item_row['id']}",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["meta"]["totals"]["grandTotal"] == 5400.0

    async with TestingSessionLocal() as db:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert float(order.total_amount) == 5400.0


async def test_delete_unknown_item_is_404(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    resp = await client.delete(
        f"/api/v1/orders/{order_id}/items/nope", headers=_auth(worker_token)
    )
    assert resp.status_code == 404


# ---------- terminal orders are read-only ----------

async def test_terminal_order_refuses_item_changes(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    added = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    row_id = added.json()["data"][0]["id"]
    await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "cancelled"}}},
        headers=_auth(worker_token),
    )
    add = await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    assert add.status_code == 409
    delete = await client.delete(
        f"/api/v1/orders/{order_id}/items/{row_id}", headers=_auth(worker_token)
    )
    assert delete.status_code == 409


# ---------- legacy composition (ETL/checkout bouquet_ids JSON) ----------

async def test_legacy_order_exposes_readonly_composition(client, worker_token, seed):
    async with TestingSessionLocal() as db:
        order = Order(
            customer_name="Импорт",
            phone="+70000000000",
            address="",
            total_amount=3200,
            bouquet_ids=json.dumps([
                {"recipe_id": "r1", "title": "Букет из роз", "price": 1600, "qty": 2},
            ]),
            store_id=seed["store_id"],
        )
        db.add(order)
        await db.commit()
        order_id = order.id

    resp = await client.get(
        f"/api/v1/orders/{order_id}/items", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["meta"]["readOnly"] is True
    rows = body["data"]
    assert len(rows) == 1
    a = rows[0]["attributes"]
    assert a["kind"] == "bouquet"
    assert a["title"] == "Букет из роз"
    assert a["unitPrice"] == 1600.0
    assert a["quantity"] == 2.0
    assert a["sum"] == 3200.0
    totals = body["meta"]["totals"]
    # Legacy totals come from the imported order.total_amount, not per-line math.
    assert totals["grandTotal"] == 3200.0
    assert totals["toPay"] == 3200.0


# ---------- advances ----------

async def test_advance_reduces_to_pay(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "cash", "amount": 2400},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    totals = body["meta"]["totals"]
    assert totals["advances"] == 2400.0
    assert totals["grandTotal"] == 5400.0
    assert totals["toPay"] == 3000.0
    payments = body["meta"]["payments"]
    assert len(payments) == 1
    pa = payments[0]["attributes"]
    assert pa["method"] == "cash"
    assert pa["paymentType"] == "advance"
    assert pa["posted"] is True
    assert pa["fiscalized"] is False
    # The manual advance never enters the T-Bank flow.
    assert pa["terminalTransactionId"] is None


async def test_advance_exceeding_to_pay_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    resp = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "card", "amount": 5401},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "превышает" in resp.json()["detail"]


async def test_advance_with_bad_method_or_amount_is_400(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    bad_method = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "bitcoin", "amount": 100},
        headers=_auth(worker_token),
    )
    assert bad_method.status_code == 400
    zero = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "cash", "amount": 0},
        headers=_auth(worker_token),
    )
    assert zero.status_code == 400
    negative = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "cash", "amount": -50},
        headers=_auth(worker_token),
    )
    assert negative.status_code == 400


async def test_advance_on_legacy_order_uses_total_amount(client, worker_token, seed):
    """A legacy order (no order_items) still accepts advances against its
    imported total_amount remainder."""
    async with TestingSessionLocal() as db:
        order = Order(
            customer_name="Импорт",
            phone="+70000000001",
            address="",
            total_amount=1000,
            bouquet_ids=json.dumps([
                {"recipe_id": "r1", "title": "Букет", "price": 1000, "qty": 1},
            ]),
            store_id=seed["store_id"],
        )
        db.add(order)
        await db.commit()
        order_id = order.id

    ok = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "sbp", "amount": 600},
        headers=_auth(worker_token),
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["meta"]["totals"]["toPay"] == 400.0

    too_much = await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "sbp", "amount": 500},
        headers=_auth(worker_token),
    )
    assert too_much.status_code == 400


async def test_order_payments_listing(client, worker_token, seed):
    order_id = await _create_order(client, worker_token, seed)
    await client.post(
        f"/api/v1/orders/{order_id}/items",
        json={"bouquetId": seed["bouquet_id"]},
        headers=_auth(worker_token),
    )
    await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "cash", "amount": 100},
        headers=_auth(worker_token),
    )
    await client.post(
        f"/api/v1/orders/{order_id}/payments",
        json={"method": "card", "amount": 200},
        headers=_auth(worker_token),
    )
    resp = await client.get(
        f"/api/v1/orders/{order_id}/payments", headers=_auth(worker_token)
    )
    assert resp.status_code == 200
    rows = resp.json()["data"]
    # created_at has second precision, so same-second rows have no stable
    # order — compare as sets.
    assert sorted(r["attributes"]["amount"] for r in rows) == [100, 200]
    assert sorted(r["attributes"]["method"] for r in rows) == ["card", "cash"]
