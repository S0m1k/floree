"""Admin order write operations — POST /v1/orders (create) and
PATCH /v1/orders/{id} (status change).

Covers the invariants from docs/posiflora/admin-map.md §2.2.1/§2.2.2:
- create assigns a growing order number, status='new', an author, and a history
  entry; auth is required;
- status change appends history and refuses to move out of terminal statuses;
- input is validated (missing store, unknown status).
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Customer
from app.dictionary_models import CustomerDealSource, OrderTag
from tests.conftest import TestingSessionLocal


@pytest_asyncio.fixture
async def seed_refs(client):
    """Seed a store, customer, deal source and tag; return their ids."""
    async with TestingSessionLocal() as db:
        store = Store(title="Магазин на Невском", address="Невский, 1")
        customer = Customer(name="Иван Петров", phone="+79990001122")
        source = CustomerDealSource(title="Телефон")
        tag = OrderTag(title="WOW эффект")
        db.add_all([store, customer, source, tag])
        await db.commit()
        return {
            "store_id": store.id,
            "customer_id": customer.id,
            "source_id": source.id,
            "tag_id": tag.id,
        }


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_body(refs, **attr_overrides):
    attrs = {
        "budget": 5000,
        "comment": "Букет ко дню рождения",
        "delivery": "delivery",
        "deliveryCity": "Санкт-Петербург",
        "deliveryStreet": "Невский проспект",
        "deliveryHouse": "12",
        "deliveryApartment": "5",
        "dueDate": "2026-07-10",
        "deliveryTimeFrom": "12:00",
        "deliveryTimeTo": "14:00",
    }
    attrs.update(attr_overrides)
    return {
        "data": {
            "type": "orders",
            "attributes": attrs,
            "relationships": {
                "store": {"data": {"type": "stores", "id": refs["store_id"]}},
                "customer": {"data": {"type": "customers", "id": refs["customer_id"]}},
                "source": {"data": {"type": "order-sources", "id": refs["source_id"]}},
                "tags": {"data": [{"type": "order-tags", "id": refs["tag_id"]}]},
            },
        }
    }


async def test_create_order_requires_auth(client, seed_refs):
    resp = await client.post("/api/v1/orders", json=_create_body(seed_refs))
    assert resp.status_code == 401


async def test_create_order_sets_new_status_and_author(client, worker_token, seed_refs):
    resp = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    a = data["attributes"]
    assert a["status"] == "new"
    assert a["budget"] == 5000
    assert a["delivery"] is True
    assert a["deliveryCity"] == "Санкт-Петербург"
    assert a["docNo"]  # sequential number assigned
    # customer name/phone are derived server-side from the linked customer.
    assert a["deliveryContact"] == "Иван Петров"
    assert data["relationships"]["store"]["data"]["id"] == seed_refs["store_id"]
    assert data["relationships"]["customer"]["data"]["id"] == seed_refs["customer_id"]
    assert data["relationships"]["tags"]["data"][0]["id"] == seed_refs["tag_id"]
    assert data["relationships"]["createdBy"]["data"] is not None


async def test_create_order_writes_status_history(client, worker_token, seed_refs):
    resp = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = resp.json()["data"]["id"]
    hist = await client.get(
        f"/api/v1/orders/{order_id}/status-history", headers=_auth(worker_token)
    )
    entries = hist.json()["data"]
    assert len(entries) == 1
    assert entries[0]["attributes"]["status"] == "new"
    assert entries[0]["relationships"]["worker"]["data"] is not None


async def test_order_number_increments(client, worker_token, seed_refs):
    first = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    second = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    n1 = int(first.json()["data"]["attributes"]["docNo"])
    n2 = int(second.json()["data"]["attributes"]["docNo"])
    assert n2 == n1 + 1


async def test_order_number_ignores_timestamp_junk_and_continues_posiflora_series(
    client, worker_token, seed_refs
):
    """ETL rows carry order_numbers trimmed from storefront doc numbers
    (12-digit payment timestamps) — the counter must skip them and continue
    Posiflora's own YY###### series instead."""
    from app.models import Order
    from tests.conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        db.add(Order(
            customer_name="", phone="", address="", bouquet_ids="[]",
            posiflora_doc_no="778852657260", order_number=778852657260,
        ))
        db.add(Order(
            customer_name="", phone="", address="", bouquet_ids="[]",
            posiflora_doc_no="aaab26000008", order_number=26000008,
        ))
        await db.commit()

    resp = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["attributes"]["docNo"] == "26000009"


async def test_create_pickup_order_has_no_address(client, worker_token, seed_refs):
    resp = await client.post(
        "/api/v1/orders",
        json=_create_body(seed_refs, delivery="pickup"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["delivery"] is False
    assert a["deliveryType"] == "pickup"


async def test_create_order_without_store_is_400(client, worker_token, seed_refs):
    body = _create_body(seed_refs)
    del body["data"]["relationships"]["store"]
    resp = await client.post("/api/v1/orders", json=body, headers=_auth(worker_token))
    assert resp.status_code == 400


async def test_create_order_unknown_store_is_400(client, worker_token, seed_refs):
    body = _create_body(seed_refs)
    body["data"]["relationships"]["store"]["data"]["id"] = "does-not-exist"
    resp = await client.post("/api/v1/orders", json=body, headers=_auth(worker_token))
    assert resp.status_code == 400


async def test_create_order_overlong_comment_is_400(client, worker_token, seed_refs):
    resp = await client.post(
        "/api/v1/orders",
        json=_create_body(seed_refs, comment="x" * 501),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_status_change_appends_history(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"type": "orders", "attributes": {"status": "assembled"}}},
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["data"]["attributes"]["status"] == "assembled"

    hist = await client.get(
        f"/api/v1/orders/{order_id}/status-history", headers=_auth(worker_token)
    )
    statuses = [e["attributes"]["status"] for e in hist.json()["data"]]
    assert statuses == ["new", "assembled"]


async def test_status_change_to_terminal_sets_closed(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]
    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "completed"}}},
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200
    assert patch.json()["data"]["attributes"]["closedAt"] is not None


async def test_status_change_from_terminal_is_409(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]
    await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "cancelled"}}},
        headers=_auth(worker_token),
    )
    # Now cancelled (terminal) — any further change must be refused.
    again = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "new"}}},
        headers=_auth(worker_token),
    )
    assert again.status_code == 409


async def test_status_change_invalid_status_is_400(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "banana"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_status_change_requires_auth(client, seed_refs):
    resp = await client.patch(
        "/api/v1/orders/whatever",
        json={"data": {"attributes": {"status": "assembled"}}},
    )
    assert resp.status_code == 401


# ---------- order tags: read, PATCH, filter, aggregates ----------


async def test_order_response_includes_tag_titles(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]

    resp = await client.get(f"/api/v1/orders/{order_id}", headers=_auth(worker_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["relationships"]["tags"]["data"][0]["id"] == seed_refs["tag_id"]
    included = {(i["type"], i["id"]): i for i in body.get("included", [])}
    tag_res = included[("order-tags", seed_refs["tag_id"])]
    assert tag_res["attributes"]["title"] == "WOW эффект"


async def test_order_list_includes_tag_titles_without_n_plus_1(client, worker_token, seed_refs):
    await client.post("/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token))
    await client.post("/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token))

    resp = await client.get("/api/v1/orders", headers=_auth(worker_token))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) >= 2
    tag_included = [i for i in body.get("included", []) if i["type"] == "order-tags"]
    # One tag used by every seeded order — de-duplicated to a single included resource.
    assert len(tag_included) == 1
    assert tag_included[0]["id"] == seed_refs["tag_id"]


async def test_patch_tags_updates_order(client, worker_token, seed_refs):
    async with TestingSessionLocal() as db:
        other_tag = OrderTag(title="Срочно")
        db.add(other_tag)
        await db.commit()
        other_tag_id = other_tag.id

    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={
            "data": {
                "type": "orders",
                "relationships": {
                    "tags": {"data": [{"type": "order-tags", "id": other_tag_id}]}
                },
            }
        },
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200, patch.text
    tag_ids = [t["id"] for t in patch.json()["data"]["relationships"]["tags"]["data"]]
    assert tag_ids == [other_tag_id]


async def test_patch_unknown_tag_is_400(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={
            "data": {
                "type": "orders",
                "relationships": {
                    "tags": {"data": [{"type": "order-tags", "id": "does-not-exist"}]}
                },
            }
        },
        headers=_auth(worker_token),
    )
    assert patch.status_code == 400


async def test_patch_tags_and_comment_on_terminal_order_is_allowed(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]
    await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "completed"}}},
        headers=_auth(worker_token),
    )

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={
            "data": {
                "type": "orders",
                "attributes": {"comment": "Обновили после закрытия"},
                "relationships": {"tags": {"data": []}},
            }
        },
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200, patch.text
    a = patch.json()["data"]["attributes"]
    assert a["description"] == "Обновили после закрытия"
    assert patch.json()["data"]["relationships"]["tags"]["data"] == []


async def test_patch_status_on_terminal_order_still_409(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]
    await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "completed"}}},
        headers=_auth(worker_token),
    )

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"status": "new"}}},
        headers=_auth(worker_token),
    )
    assert patch.status_code == 409


async def test_patch_overlong_comment_is_400(client, worker_token, seed_refs):
    created = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    order_id = created.json()["data"]["id"]

    patch = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"data": {"attributes": {"comment": "x" * 501}}},
        headers=_auth(worker_token),
    )
    assert patch.status_code == 400


async def test_filter_by_tag_returns_only_matching_orders(client, worker_token, seed_refs):
    async with TestingSessionLocal() as db:
        other_tag = OrderTag(title="Без тега")
        db.add(other_tag)
        await db.commit()
        other_tag_id = other_tag.id

    tagged = await client.post(
        "/api/v1/orders", json=_create_body(seed_refs), headers=_auth(worker_token)
    )
    tagged_id = tagged.json()["data"]["id"]

    untagged_body = _create_body(seed_refs)
    del untagged_body["data"]["relationships"]["tags"]
    await client.post("/api/v1/orders", json=untagged_body, headers=_auth(worker_token))

    resp = await client.get(
        f"/api/v1/orders?filter[tag]={seed_refs['tag_id']}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200
    ids = [o["id"] for o in resp.json()["data"]]
    assert ids == [tagged_id]

    # A tag that exists but is never applied returns an empty set, not everything.
    resp_empty = await client.get(
        f"/api/v1/orders?filter[tag]={other_tag_id}", headers=_auth(worker_token)
    )
    assert resp_empty.json()["data"] == []


async def test_order_list_aggregates_arithmetic(client, worker_token, seed_refs):
    first = await client.post(
        "/api/v1/orders",
        json=_create_body(seed_refs, budget=1000),
        headers=_auth(worker_token),
    )
    second = await client.post(
        "/api/v1/orders",
        json=_create_body(seed_refs, budget=2000),
        headers=_auth(worker_token),
    )
    first_id = first.json()["data"]["id"]
    second_id = second.json()["data"]["id"]

    # Give each order a priced composition line + a settled advance so
    # ordersTotal/paidTotal/creditTotal have non-trivial values to check.
    async with TestingSessionLocal() as db:
        from app.catalog_models import Store
        from app.models import Order, Payment

        store = (await db.execute(select(Store).where(Store.id == seed_refs["store_id"]))).scalar_one()
        for order_id, total, paid in ((first_id, 3000, 1200), (second_id, 5000, 5000)):
            order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
            order.total_amount = total
            order.discount_total = 100
            order.markup_total = 50
            order.bonus_paid = 10
            db.add(Payment(
                order_id=order_id, tbank_payment_id=None,
                tbank_order_id=f"manual-{order_id}", amount=paid, status="CONFIRMED",
                method="cash", kind="advance",
            ))
        await db.commit()

    resp = await client.get(
        f"/api/v1/orders?filter[store]={seed_refs['store_id']}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200
    agg = resp.json()["meta"]["aggregates"]
    assert agg["ordersTotal"] == 8000  # 3000 + 5000
    assert agg["budgetTotal"] == 3000  # 1000 + 2000
    assert agg["paidTotal"] == 6200  # 1200 + 5000
    assert agg["creditTotal"] == 1800  # 8000 - 6200
    assert agg["bonusTotal"] == 20  # 10 + 10
    assert agg["discountTotal"] == 200  # 100 + 100
    assert agg["markupTotal"] == 100  # 50 + 50
