"""Warehouse document writes — «Учёт и финансы → Склад» (admin-map.md
§2.4.3): create a draft, edit a draft, «Провести» (post — applies the
StockBalance side effects), delete a draft. Covers all six document types
via backend/app/routers/v1_warehouse_docs.py's per-type registry.

The money/quantity invariant under test: the client sends only item ids +
quantities (+ the supplier's incoming price for packing invoices — a
legitimate user input). Every derived number (line amounts, header totals,
cost bases for write-offs/markdowns/movements) is computed server-side from
StockBalance.cost_price / Item.max_price, never trusted from the request.
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store
from app.inventory_models import Item, Vendor, Warehouse, StockBalance
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store1 = Store(title="Точка 1")
        store2 = Store(title="Точка 2")
        db.add_all([store1, store2])
        await db.flush()

        vendor = Vendor(title="Цветочная база")
        rose = Item(title="Роза Кения", max_price=200)
        tulip = Item(title="Тюльпан", max_price=80)
        db.add_all([vendor, rose, tulip])
        await db.flush()

        wh1 = Warehouse(title="Склад 1", store_id=store1.id)
        wh2 = Warehouse(title="Склад 2", store_id=store2.id)
        db.add_all([wh1, wh2])
        await db.flush()

        # Rose has existing stock + a known cost basis at store1's warehouse —
        # write-off/markdown/inventory/movement all read cost_price from here.
        sb_rose = StockBalance(warehouse_id=wh1.id, item_id=rose.id, quantity=10, cost_price=120)
        db.add(sb_rose)
        await db.commit()

        return {
            "store1_id": store1.id,
            "store2_id": store2.id,
            "vendor_id": vendor.id,
            "rose_id": rose.id,
            "tulip_id": tulip.id,
            "wh1_id": wh1.id,
        }


async def _balance(item_id: str, warehouse_id: str) -> StockBalance | None:
    async with TestingSessionLocal() as db:
        return (
            await db.execute(
                select(StockBalance).where(
                    StockBalance.warehouse_id == warehouse_id, StockBalance.item_id == item_id
                )
            )
        ).scalar_one_or_none()


# ==========================================================================
# auth
# ==========================================================================

DOC_TYPES = [
    "packing-invoices", "write-off-invoices", "markdown-acts",
    "sorting-acts", "inventory-acts", "movement-acts",
]


async def test_all_doc_types_require_auth(client, seed):
    for doc_type in DOC_TYPES:
        assert (await client.post(f"/api/v1/{doc_type}", json={})).status_code == 401
        assert (await client.patch(f"/api/v1/{doc_type}/x", json={})).status_code == 401
        assert (await client.post(f"/api/v1/{doc_type}/x/post")).status_code == 401
        assert (await client.delete(f"/api/v1/{doc_type}/x")).status_code == 401


# ==========================================================================
# packing invoices — приходная накладная (+qty on posting)
# ==========================================================================

async def _create_packing_invoice(client, token, seed, *, price=100, quantity=3):
    resp = await client.post(
        "/api/v1/packing-invoices",
        json={
            "data": {
                "type": "packing-invoices",
                "attributes": {"date": "2026-07-18"},
                "relationships": {
                    "store": {"data": {"type": "stores", "id": seed["store1_id"]}},
                    "vendor": {"data": {"type": "vendors", "id": seed["vendor_id"]}},
                },
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": quantity, "price": price}],
        },
        headers=_auth(token),
    )
    return resp


async def test_create_packing_invoice_computes_amount_server_side(client, worker_token, seed):
    # Client "offers" a bogus amount — only itemId/quantity/price are read,
    # and the header total is the server's own qty*price sum, not this.
    resp = await client.post(
        "/api/v1/packing-invoices",
        json={
            "data": {
                "type": "packing-invoices",
                "attributes": {"date": "2026-07-18", "amount": 1},
                "relationships": {
                    "store": {"data": {"type": "stores", "id": seed["store1_id"]}},
                    "vendor": {"data": {"type": "vendors", "id": seed["vendor_id"]}},
                },
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": 3, "price": 100}],
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    a = body["data"]["attributes"]
    assert a["amount"] == 300.0
    assert a["linesCount"] == 1
    assert a["status"] == "draft"
    assert a["docNo"].startswith("ПН-")
    line = body["included"][0]["attributes"]
    assert line["qty"] == 3.0
    assert line["amount"] == 300.0


async def test_create_packing_invoice_requires_price(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/packing-invoices",
        json={
            "data": {
                "type": "packing-invoices",
                "relationships": {
                    "store": {"data": {"type": "stores", "id": seed["store1_id"]}},
                    "vendor": {"data": {"type": "vendors", "id": seed["vendor_id"]}},
                },
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": 3}],
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_edit_posted_packing_invoice_is_409(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/packing-invoices/{doc_id}/post", headers=_auth(worker_token))

    resp = await client.patch(
        f"/api/v1/packing-invoices/{doc_id}",
        json={"data": {"attributes": {"date": "2026-07-19"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409


async def test_post_packing_invoice_increases_stock(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed, price=150, quantity=5)
    doc_id = created.json()["data"]["id"]

    before = await _balance(seed["rose_id"], seed["wh1_id"])
    assert before is not None and float(before.quantity) == 10

    resp = await client.post(f"/api/v1/packing-invoices/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["posted"] is True

    after = await _balance(seed["rose_id"], seed["wh1_id"])
    assert float(after.quantity) == 15  # 10 + 5
    assert float(after.cost_price) == 150  # latest incoming price becomes the cost basis


async def test_repost_packing_invoice_is_409(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/packing-invoices/{doc_id}/post", headers=_auth(worker_token))

    resp = await client.post(f"/api/v1/packing-invoices/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_posted_packing_invoice_is_409(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/packing-invoices/{doc_id}/post", headers=_auth(worker_token))

    resp = await client.delete(f"/api/v1/packing-invoices/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_draft_packing_invoice(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/packing-invoices/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/v1/packing-invoices/{doc_id}", headers=_auth(worker_token))
    assert get_resp.status_code == 404


async def test_edit_draft_packing_invoice_replaces_lines(client, worker_token, seed):
    created = await _create_packing_invoice(client, worker_token, seed, price=100, quantity=3)
    doc_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/packing-invoices/{doc_id}",
        json={"lines": [{"itemId": seed["tulip_id"], "quantity": 2, "price": 40}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["amount"] == 80.0
    assert a["linesCount"] == 1


# ==========================================================================
# write-off invoices — накладная на списание (−qty on posting)
# ==========================================================================

async def _create_writeoff(client, token, seed, *, quantity=4, reason="Порча"):
    return await client.post(
        "/api/v1/write-off-invoices",
        json={
            "data": {
                "type": "write-off-invoices",
                "attributes": {"date": "2026-07-18", "reason": reason},
                "relationships": {"store": {"data": {"type": "stores", "id": seed["store1_id"]}}},
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": quantity}],
        },
        headers=_auth(token),
    )


async def test_create_writeoff_uses_stock_cost_price_not_client(client, worker_token, seed):
    resp = await _create_writeoff(client, worker_token, seed, quantity=4)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    a = body["data"]["attributes"]
    # cost_price on the seeded balance is 120 -> 4 * 120 = 480, regardless of
    # any client-side price (none was even sent here).
    assert a["amount"] == 480.0
    assert a["reason"] == "Порча"
    line = body["included"][0]["attributes"]
    assert line["cost"] == 120.0


async def test_post_writeoff_decreases_stock(client, worker_token, seed):
    created = await _create_writeoff(client, worker_token, seed, quantity=4)
    doc_id = created.json()["data"]["id"]

    resp = await client.post(f"/api/v1/write-off-invoices/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text

    after = await _balance(seed["rose_id"], seed["wh1_id"])
    assert float(after.quantity) == 6  # 10 - 4


async def test_repost_writeoff_is_409(client, worker_token, seed):
    created = await _create_writeoff(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/write-off-invoices/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.post(f"/api/v1/write-off-invoices/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_posted_writeoff_is_409(client, worker_token, seed):
    created = await _create_writeoff(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/write-off-invoices/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.delete(f"/api/v1/write-off-invoices/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_edit_posted_writeoff_is_409(client, worker_token, seed):
    created = await _create_writeoff(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/write-off-invoices/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.patch(
        f"/api/v1/write-off-invoices/{doc_id}",
        json={"data": {"attributes": {"reason": "Другая причина"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409


# ==========================================================================
# markdown acts — акт уценки (−qty on posting, per spec)
# ==========================================================================

async def _create_markdown(client, token, seed, *, quantity=2, new_price=150):
    return await client.post(
        "/api/v1/markdown-acts",
        json={
            "data": {
                "type": "markdown-acts",
                "attributes": {"date": "2026-07-18"},
                "relationships": {"store": {"data": {"type": "stores", "id": seed["store1_id"]}}},
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": quantity, "newPrice": new_price}],
        },
        headers=_auth(token),
    )


async def test_create_markdown_act_uses_server_old_price(client, worker_token, seed):
    resp = await _create_markdown(client, worker_token, seed, quantity=2, new_price=150)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["data"]["attributes"]["linesCount"] == 1
    line = body["included"][0]["attributes"]
    assert line["oldPrice"] == 200.0  # Item.max_price, not client-supplied
    assert line["newPrice"] == 150.0


async def test_post_markdown_act_decreases_stock(client, worker_token, seed):
    created = await _create_markdown(client, worker_token, seed, quantity=2)
    doc_id = created.json()["data"]["id"]
    resp = await client.post(f"/api/v1/markdown-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    after = await _balance(seed["rose_id"], seed["wh1_id"])
    assert float(after.quantity) == 8  # 10 - 2


async def test_repost_markdown_act_is_409(client, worker_token, seed):
    created = await _create_markdown(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/markdown-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.post(f"/api/v1/markdown-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_posted_markdown_act_is_409(client, worker_token, seed):
    created = await _create_markdown(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/markdown-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.delete(f"/api/v1/markdown-acts/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


# ==========================================================================
# sorting acts — акт пересорта (item_from -qty, item_to +qty on posting)
# ==========================================================================

async def _create_sorting(client, token, seed, *, quantity=3):
    return await client.post(
        "/api/v1/sorting-acts",
        json={
            "data": {
                "type": "sorting-acts",
                "attributes": {"date": "2026-07-18"},
                "relationships": {"store": {"data": {"type": "stores", "id": seed["store1_id"]}}},
            },
            "lines": [{"itemFromId": seed["rose_id"], "itemToId": seed["tulip_id"], "quantity": quantity}],
        },
        headers=_auth(token),
    )


async def test_create_sorting_act(client, worker_token, seed):
    resp = await _create_sorting(client, worker_token, seed, quantity=3)
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["attributes"]["linesCount"] == 1


async def test_create_sorting_act_same_item_is_400(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/sorting-acts",
        json={
            "data": {
                "relationships": {"store": {"data": {"type": "stores", "id": seed["store1_id"]}}},
            },
            "lines": [{"itemFromId": seed["rose_id"], "itemToId": seed["rose_id"], "quantity": 1}],
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_post_sorting_act_moves_stock_between_items(client, worker_token, seed):
    created = await _create_sorting(client, worker_token, seed, quantity=3)
    doc_id = created.json()["data"]["id"]

    resp = await client.post(f"/api/v1/sorting-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text

    rose_after = await _balance(seed["rose_id"], seed["wh1_id"])
    tulip_after = await _balance(seed["tulip_id"], seed["wh1_id"])
    assert float(rose_after.quantity) == 7  # 10 - 3
    assert float(tulip_after.quantity) == 3  # 0 + 3


async def test_repost_sorting_act_is_409(client, worker_token, seed):
    created = await _create_sorting(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/sorting-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.post(f"/api/v1/sorting-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


# ==========================================================================
# inventory acts — акт инвентаризации (sets actual qty, ± financial result)
# ==========================================================================

async def _create_inventory_act(client, token, seed, *, actual_qty=7):
    return await client.post(
        "/api/v1/inventory-acts",
        json={
            "data": {
                "type": "inventory-acts",
                "attributes": {"date": "2026-07-18"},
                "relationships": {"store": {"data": {"type": "stores", "id": seed["store1_id"]}}},
            },
            "lines": [{"itemId": seed["rose_id"], "actualQty": actual_qty}],
        },
        headers=_auth(token),
    )


async def test_create_inventory_act_computes_expected_from_stock(client, worker_token, seed):
    resp = await _create_inventory_act(client, worker_token, seed, actual_qty=7)
    assert resp.status_code == 201, resp.text
    line = resp.json()["data"] and (await client.get(
        f"/api/v1/inventory-acts/{resp.json()['data']['id']}", headers=_auth(worker_token)
    )).json()["included"][0]["attributes"]
    assert line["expectedQty"] == 10.0  # from the seeded StockBalance
    assert line["qty"] == 7.0  # actual (serializer exposes actual as "qty")


async def test_post_inventory_act_sets_stock_and_financial_result(client, worker_token, seed):
    # actual (7) < expected (10) -> shortage: financial_result = (7-10)*120 = -360
    created = await _create_inventory_act(client, worker_token, seed, actual_qty=7)
    doc_id = created.json()["data"]["id"]

    resp = await client.post(f"/api/v1/inventory-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["amount"] == -360.0

    after = await _balance(seed["rose_id"], seed["wh1_id"])
    assert float(after.quantity) == 7


async def test_repost_inventory_act_is_409(client, worker_token, seed):
    created = await _create_inventory_act(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/inventory-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.post(f"/api/v1/inventory-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_posted_inventory_act_is_409(client, worker_token, seed):
    created = await _create_inventory_act(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/inventory-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.delete(f"/api/v1/inventory-acts/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


# ==========================================================================
# movement acts — акт перемещения (−qty on source, +qty on destination)
# ==========================================================================

async def _create_movement(client, token, seed, *, quantity=4):
    return await client.post(
        "/api/v1/movement-acts",
        json={
            "data": {
                "type": "movement-acts",
                "attributes": {"date": "2026-07-18"},
                "relationships": {
                    "fromStore": {"data": {"type": "stores", "id": seed["store1_id"]}},
                    "toStore": {"data": {"type": "stores", "id": seed["store2_id"]}},
                },
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": quantity}],
        },
        headers=_auth(token),
    )


async def test_create_movement_act_computes_cost_from_source_stock(client, worker_token, seed):
    resp = await _create_movement(client, worker_token, seed, quantity=4)
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["amount"] == 480.0  # 4 * cost_price(120)


async def test_create_movement_act_same_store_is_400(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/movement-acts",
        json={
            "data": {
                "relationships": {
                    "fromStore": {"data": {"type": "stores", "id": seed["store1_id"]}},
                    "toStore": {"data": {"type": "stores", "id": seed["store1_id"]}},
                },
            },
            "lines": [{"itemId": seed["rose_id"], "quantity": 1}],
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_post_movement_act_moves_stock_between_stores(client, worker_token, seed):
    created = await _create_movement(client, worker_token, seed, quantity=4)
    doc_id = created.json()["data"]["id"]

    resp = await client.post(f"/api/v1/movement-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text

    async with TestingSessionLocal() as db:
        from app.inventory_models import Warehouse

        wh2_row = (
            await db.execute(select(Warehouse).where(Warehouse.store_id == seed["store2_id"]))
        ).scalar_one()

    source_after = await _balance(seed["rose_id"], seed["wh1_id"])
    dest_after = await _balance(seed["rose_id"], wh2_row.id)
    assert float(source_after.quantity) == 6  # 10 - 4
    assert dest_after is not None
    assert float(dest_after.quantity) == 4
    assert float(dest_after.cost_price) == 120  # cost basis carried over


async def test_repost_movement_act_is_409(client, worker_token, seed):
    created = await _create_movement(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/movement-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.post(f"/api/v1/movement-acts/{doc_id}/post", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_posted_movement_act_is_409(client, worker_token, seed):
    created = await _create_movement(client, worker_token, seed)
    doc_id = created.json()["data"]["id"]
    await client.post(f"/api/v1/movement-acts/{doc_id}/post", headers=_auth(worker_token))
    resp = await client.delete(f"/api/v1/movement-acts/{doc_id}", headers=_auth(worker_token))
    assert resp.status_code == 409
