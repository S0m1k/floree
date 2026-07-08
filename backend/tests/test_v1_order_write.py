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
