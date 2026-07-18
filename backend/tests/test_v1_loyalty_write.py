"""Клиенты и развитие → Система лояльности (admin-map §2.5.4-2.5.6).

- CRUD for bonus groups, discount groups and bonus-card templates.
- Percent fields are 0..100, entryThreshold >= 0; title is required.
- A group can't be deleted while a customer is still assigned to it (409).
- PATCH /v1/customers/{id} with relationships.bonusGroup/discountGroup
  changes the customer's tier; a bonus-group change writes
  customer_bonus_group_history with the author from the JWT.
- POST /v1/bonus-groups/recalculate assigns every customer to the group with
  the largest entryThreshold <= their lifetime order total, and logs
  is_automatic=True history rows for whoever actually moved.
- Everything requires auth (401).
"""

import pytest

from app.catalog_models import Customer
from app.models import Order
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _bonus_group_body(title="Система лояльности 3%", **attrs):
    defaults = {
        "title": title,
        "accrualPercent": 3,
        "maxPercent": 50,
        "entryThreshold": 0,
        "isPublic": True,
    }
    defaults.update(attrs)
    return {"data": {"type": "bonus-groups", "attributes": defaults}}


def _discount_group_body(title="Скидка 10%", **attrs):
    defaults = {
        "title": title,
        "discountPercent": 10,
        "entryThreshold": 0,
        "isPublic": True,
    }
    defaults.update(attrs)
    return {"data": {"type": "discount-groups", "attributes": defaults}}


def _bonus_card_body(title="FLOREE", **attrs):
    defaults = {"title": title, "shopName": "Floree"}
    defaults.update(attrs)
    return {"data": {"type": "bonus-cards", "attributes": defaults}}


async def _seed_customer(**kwargs) -> str:
    defaults = dict(name="Клиент", phone="+79990000000")
    defaults.update(kwargs)
    async with TestingSessionLocal() as db:
        customer = Customer(**defaults)
        db.add(customer)
        await db.commit()
        return customer.id


async def _seed_order(**kwargs) -> str:
    defaults = dict(
        customer_name="", phone="", address="", status="completed",
        payment_status="paid", bouquet_ids="[]", total_amount=0,
    )
    defaults.update(kwargs)
    async with TestingSessionLocal() as db:
        order = Order(**defaults)
        db.add(order)
        await db.commit()
        return order.id


# ---------- bonus groups: CRUD ----------


async def test_bonus_group_writes_require_auth(client):
    assert (await client.post("/api/v1/bonus-groups", json=_bonus_group_body())).status_code == 401
    assert (await client.patch("/api/v1/bonus-groups/x", json=_bonus_group_body())).status_code == 401
    assert (await client.delete("/api/v1/bonus-groups/x")).status_code == 401
    assert (await client.post("/api/v1/bonus-groups/recalculate")).status_code == 401


async def test_create_and_list_bonus_group(client, worker_token):
    resp = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Система лояльности 3%"
    assert a["accrualPercent"] == 3
    assert a["maxPercent"] == 50
    assert a["entryThreshold"] == 0
    assert a["isPublic"] is True
    assert a["status"] == "active"

    listing = await client.get("/api/v1/bonus-groups", headers=_auth(worker_token))
    titles = [g["attributes"]["title"] for g in listing.json()["data"]]
    assert "Система лояльности 3%" in titles


async def test_create_bonus_group_requires_title(client, worker_token):
    resp = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(title="  "), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


@pytest.fixture(params=["accrualPercent", "maxPercent"])
def percent_field(request):
    return request.param


async def test_bonus_group_percent_out_of_range_is_400(client, worker_token, percent_field):
    resp = await client.post(
        "/api/v1/bonus-groups",
        json=_bonus_group_body(**{percent_field: 101}),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    resp2 = await client.post(
        "/api/v1/bonus-groups",
        json=_bonus_group_body(**{percent_field: -1}),
        headers=_auth(worker_token),
    )
    assert resp2.status_code == 400


async def test_bonus_group_negative_threshold_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/bonus-groups",
        json=_bonus_group_body(entryThreshold=-100),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_update_bonus_group(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/bonus-groups/{group_id}",
        json={"data": {"attributes": {"accrualPercent": 5, "status": "archived"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["accrualPercent"] == 5
    assert a["status"] == "archived"
    assert a["title"] == "Система лояльности 3%"  # untouched


async def test_update_bonus_group_bad_status_is_400(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/bonus-groups/{group_id}",
        json={"data": {"attributes": {"status": "deleted"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_update_unknown_bonus_group_is_404(client, worker_token):
    resp = await client.patch(
        "/api/v1/bonus-groups/nope",
        json={"data": {"attributes": {"accrualPercent": 5}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


async def test_delete_bonus_group(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    resp = await client.delete(f"/api/v1/bonus-groups/{group_id}", headers=_auth(worker_token))
    assert resp.status_code == 204

    listing = await client.get("/api/v1/bonus-groups", headers=_auth(worker_token))
    assert group_id not in [g["id"] for g in listing.json()["data"]]


async def test_delete_unknown_bonus_group_is_404(client, worker_token):
    resp = await client.delete("/api/v1/bonus-groups/nope", headers=_auth(worker_token))
    assert resp.status_code == 404


async def test_delete_bonus_group_with_customer_is_409(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    cid = await _seed_customer()

    patch = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": {"type": "bonus-groups", "id": group_id}}}}},
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200, patch.text

    resp = await client.delete(f"/api/v1/bonus-groups/{group_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


# ---------- discount groups: CRUD ----------


async def test_discount_group_writes_require_auth(client):
    assert (
        await client.post("/api/v1/discount-groups", json=_discount_group_body())
    ).status_code == 401
    assert (
        await client.patch("/api/v1/discount-groups/x", json=_discount_group_body())
    ).status_code == 401
    assert (await client.delete("/api/v1/discount-groups/x")).status_code == 401


async def test_create_discount_group(client, worker_token):
    resp = await client.post(
        "/api/v1/discount-groups", json=_discount_group_body(), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Скидка 10%"
    assert a["discountPercent"] == 10
    assert a["entryThreshold"] == 0
    assert a["status"] == "active"


async def test_discount_group_percent_out_of_range_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/discount-groups",
        json=_discount_group_body(discountPercent=150),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_update_discount_group(client, worker_token):
    created = await client.post(
        "/api/v1/discount-groups", json=_discount_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/discount-groups/{group_id}",
        json={"data": {"attributes": {"discountPercent": 15}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["discountPercent"] == 15


async def test_delete_discount_group_with_customer_is_409(client, worker_token):
    created = await client.post(
        "/api/v1/discount-groups", json=_discount_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    cid = await _seed_customer()

    patch = await client.patch(
        f"/api/v1/customers/{cid}",
        json={
            "data": {
                "relationships": {
                    "discountGroup": {"data": {"type": "discount-groups", "id": group_id}}
                }
            }
        },
        headers=_auth(worker_token),
    )
    assert patch.status_code == 200, patch.text

    resp = await client.delete(f"/api/v1/discount-groups/{group_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_discount_group_without_customers(client, worker_token):
    created = await client.post(
        "/api/v1/discount-groups", json=_discount_group_body(), headers=_auth(worker_token)
    )
    group_id = created.json()["data"]["id"]
    resp = await client.delete(f"/api/v1/discount-groups/{group_id}", headers=_auth(worker_token))
    assert resp.status_code == 204


# ---------- bonus cards: CRUD ----------


async def test_bonus_card_writes_require_auth(client):
    assert (await client.post("/api/v1/bonus-cards", json=_bonus_card_body())).status_code == 401
    assert (await client.patch("/api/v1/bonus-cards/x", json=_bonus_card_body())).status_code == 401
    assert (await client.delete("/api/v1/bonus-cards/x")).status_code == 401


async def test_create_bonus_card(client, worker_token):
    resp = await client.post(
        "/api/v1/bonus-cards", json=_bonus_card_body(), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "FLOREE"
    assert a["shopName"] == "Floree"
    assert a["status"] == "active"
    assert a["createdAt"] is not None


async def test_create_bonus_card_requires_title(client, worker_token):
    resp = await client.post(
        "/api/v1/bonus-cards", json=_bonus_card_body(title=""), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_update_bonus_card(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-cards", json=_bonus_card_body(), headers=_auth(worker_token)
    )
    card_id = created.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/bonus-cards/{card_id}",
        json={"data": {"attributes": {"shopName": "Floree Center", "status": "archived"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["shopName"] == "Floree Center"
    assert a["status"] == "archived"


async def test_delete_bonus_card(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-cards", json=_bonus_card_body(), headers=_auth(worker_token)
    )
    card_id = created.json()["data"]["id"]
    resp = await client.delete(f"/api/v1/bonus-cards/{card_id}", headers=_auth(worker_token))
    assert resp.status_code == 204

    listing = await client.get("/api/v1/bonus-cards", headers=_auth(worker_token))
    assert card_id not in [c["id"] for c in listing.json()["data"]]


# ---------- customer <-> group assignment ----------


async def test_patch_customer_bonus_group_writes_history(client, worker_token):
    group_a = (
        await client.post(
            "/api/v1/bonus-groups", json=_bonus_group_body(title="Группа А"), headers=_auth(worker_token)
        )
    ).json()["data"]["id"]
    group_b = (
        await client.post(
            "/api/v1/bonus-groups", json=_bonus_group_body(title="Группа Б"), headers=_auth(worker_token)
        )
    ).json()["data"]["id"]
    cid = await _seed_customer()

    first = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": {"type": "bonus-groups", "id": group_a}}}}},
        headers=_auth(worker_token),
    )
    assert first.status_code == 200, first.text
    assert first.json()["data"]["relationships"]["bonusGroup"]["data"]["id"] == group_a

    second = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": {"type": "bonus-groups", "id": group_b}}}}},
        headers=_auth(worker_token),
    )
    assert second.status_code == 200, second.text

    hist = await client.get(
        f"/api/v1/customers/{cid}/bonus-group-history", headers=_auth(worker_token)
    )
    assert hist.status_code == 200, hist.text
    entries = hist.json()["data"]
    assert len(entries) == 2

    latest = next(e for e in entries if e["relationships"]["newGroup"]["data"]["id"] == group_b)
    assert latest["relationships"]["oldGroup"]["data"]["id"] == group_a
    assert latest["attributes"]["isAutomatic"] is False
    assert latest["relationships"]["worker"]["data"] is not None

    first_entry = next(e for e in entries if e["relationships"]["newGroup"]["data"]["id"] == group_a)
    assert first_entry["relationships"]["oldGroup"]["data"] is None


async def test_patch_customer_bonus_group_unknown_group_is_400(client, worker_token):
    cid = await _seed_customer()
    resp = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": {"type": "bonus-groups", "id": "nope"}}}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_patch_customer_bonus_group_to_null_writes_history(client, worker_token):
    group_a = (
        await client.post(
            "/api/v1/bonus-groups", json=_bonus_group_body(), headers=_auth(worker_token)
        )
    ).json()["data"]["id"]
    cid = await _seed_customer()
    await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": {"type": "bonus-groups", "id": group_a}}}}},
        headers=_auth(worker_token),
    )

    resp = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"relationships": {"bonusGroup": {"data": None}}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["relationships"]["bonusGroup"]["data"] is None

    hist = await client.get(
        f"/api/v1/customers/{cid}/bonus-group-history", headers=_auth(worker_token)
    )
    entries = hist.json()["data"]
    cleared = next(e for e in entries if e["relationships"]["newGroup"]["data"] is None)
    assert cleared["relationships"]["oldGroup"]["data"]["id"] == group_a


async def test_patch_customer_discount_group_no_history(client, worker_token):
    group = (
        await client.post(
            "/api/v1/discount-groups", json=_discount_group_body(), headers=_auth(worker_token)
        )
    ).json()["data"]["id"]
    cid = await _seed_customer()

    resp = await client.patch(
        f"/api/v1/customers/{cid}",
        json={
            "data": {
                "relationships": {"discountGroup": {"data": {"type": "discount-groups", "id": group}}}
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    rels = resp.json()["data"]["relationships"]["discountGroups"]["data"]
    assert [r["id"] for r in rels] == [group]


async def test_patch_customer_discount_group_unknown_group_is_400(client, worker_token):
    cid = await _seed_customer()
    resp = await client.patch(
        f"/api/v1/customers/{cid}",
        json={
            "data": {
                "relationships": {"discountGroup": {"data": {"type": "discount-groups", "id": "nope"}}}
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_bonus_group_history_requires_auth(client):
    resp = await client.get("/api/v1/customers/whatever/bonus-group-history")
    assert resp.status_code == 401


# ---------- automatic recalculation ----------


async def test_recalculate_assigns_by_order_total(client, worker_token):
    tier0 = (
        await client.post(
            "/api/v1/bonus-groups",
            json=_bonus_group_body(title="Тир 0", entryThreshold=0),
            headers=_auth(worker_token),
        )
    ).json()["data"]["id"]
    tier_high = (
        await client.post(
            "/api/v1/bonus-groups",
            json=_bonus_group_body(title="Тир 100000", entryThreshold=100000),
            headers=_auth(worker_token),
        )
    ).json()["data"]["id"]

    rich = await _seed_customer(phone="+79991110000")
    poor = await _seed_customer(phone="+79992220000")

    await _seed_order(customer_id=rich, phone="+70000000001", total_amount=150000)
    await _seed_order(customer_id=poor, phone="+70000000002", total_amount=500)

    resp = await client.post("/api/v1/bonus-groups/recalculate", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["updated"] == 2

    rich_after = await client.get(f"/api/v1/customers/{rich}", headers=_auth(worker_token))
    assert rich_after.json()["data"]["relationships"]["bonusGroup"]["data"]["id"] == tier_high

    poor_after = await client.get(f"/api/v1/customers/{poor}", headers=_auth(worker_token))
    assert poor_after.json()["data"]["relationships"]["bonusGroup"]["data"]["id"] == tier0

    hist = await client.get(
        f"/api/v1/customers/{rich}/bonus-group-history", headers=_auth(worker_token)
    )
    entries = hist.json()["data"]
    assert len(entries) == 1
    assert entries[0]["attributes"]["isAutomatic"] is True
    assert entries[0]["relationships"]["worker"]["data"] is None


async def test_recalculate_is_idempotent_second_run(client, worker_token):
    await client.post(
        "/api/v1/bonus-groups",
        json=_bonus_group_body(title="Тир 0", entryThreshold=0),
        headers=_auth(worker_token),
    )
    await _seed_customer()

    first = await client.post("/api/v1/bonus-groups/recalculate", headers=_auth(worker_token))
    assert first.json()["updated"] == 1

    second = await client.post("/api/v1/bonus-groups/recalculate", headers=_auth(worker_token))
    assert second.json()["updated"] == 0


async def test_recalculate_ignores_archived_groups(client, worker_token):
    created = await client.post(
        "/api/v1/bonus-groups",
        json=_bonus_group_body(title="Тир 0", entryThreshold=0),
        headers=_auth(worker_token),
    )
    group_id = created.json()["data"]["id"]
    await client.patch(
        f"/api/v1/bonus-groups/{group_id}",
        json={"data": {"attributes": {"status": "archived"}}},
        headers=_auth(worker_token),
    )
    await _seed_customer()

    resp = await client.post("/api/v1/bonus-groups/recalculate", headers=_auth(worker_token))
    assert resp.json()["updated"] == 0
