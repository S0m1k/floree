"""Admin customer card endpoints — POST/PATCH /v1/customers, stats, spend and
bonus history (docs/posiflora/admin-map.md §2.5.1).

Covers:
- create: validation (name/phone required, phone normalized, length limits),
  duplicate phone → 400, auth required;
- edit: field updates, duplicate-phone guard, bonus adjustment writes a
  CustomerBonusHistory row with the delta and the author;
- stats: orders matched both by customer_id FK and by bare phone (legacy ETL
  rows), aggregated once each;
- list: per-customer aggregates keyed by id (FK + phone matching).
"""

from datetime import datetime

import pytest_asyncio

from app.catalog_models import Customer
from app.dictionary_models import CustomerPreference
from app.models import Order
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _body(**attrs):
    defaults = {
        "title": "Анна Смирнова",
        "phone": "+7 (999) 123-45-67",
        "email": "anna@example.com",
        "gender": "female",
        "birthday": "1990-05-12",
        "instagram": "anna_flowers",
        "customerType": "person",
        "cardNumber": "CARD-001",
        "preferences": "Пионы",
        "notes": "VIP клиент",
    }
    defaults.update(attrs)
    return {"data": {"type": "customers", "attributes": defaults}}


async def _seed_order(**kwargs):
    defaults = dict(
        customer_name="",
        phone="",
        address="",
        status="completed",
        payment_status="paid",
        bouquet_ids="[]",
        total_amount=0,
    )
    defaults.update(kwargs)
    async with TestingSessionLocal() as db:
        order = Order(**defaults)
        db.add(order)
        await db.commit()
        return order.id


# ---------- POST /v1/customers ----------


async def test_create_customer_requires_auth(client):
    resp = await client.post("/api/v1/customers", json=_body())
    assert resp.status_code == 401


async def test_create_customer_normalizes_phone_and_echoes_fields(client, worker_token):
    resp = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Анна Смирнова"
    assert a["phone"] == "+79991234567"
    assert a["email"] == "anna@example.com"
    assert a["gender"] == "female"
    assert a["birthday"] == "1990-05-12"
    assert a["instagram"] == "anna_flowers"
    assert a["customerType"] == "person"
    assert a["isPerson"] is True
    assert a["cardNumber"] == "CARD-001"
    assert a["preferences"] == "Пионы"
    assert a["notes"] == "VIP клиент"
    assert a["currentPoints"] == 0


async def test_create_customer_accepts_bare_10_digit_phone(client, worker_token):
    resp = await client.post(
        "/api/v1/customers", json=_body(phone="9991234567"), headers=_auth(worker_token)
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["attributes"]["phone"] == "+79991234567"


async def test_create_customer_without_name_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/customers", json=_body(title="  "), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_create_customer_with_bad_phone_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/customers", json=_body(phone="12345"), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_create_customer_duplicate_phone_is_400(client, worker_token):
    first = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    assert first.status_code == 201
    # Same digits written differently must still collide after normalization.
    resp = await client.post(
        "/api/v1/customers",
        json=_body(title="Другой Клиент", phone="8 999 123 45 67"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
    assert "телефон" in resp.json()["detail"].lower()


async def test_create_customer_overlong_comment_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/customers", json=_body(notes="x" * 501), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_create_customer_overlong_name_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/customers", json=_body(title="и" * 65), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


# ---------- PATCH /v1/customers/{id} ----------


async def test_patch_customer_updates_fields(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/customers/{cid}",
        json={
            "data": {
                "type": "customers",
                "attributes": {"title": "Анна Иванова", "gender": "other", "instagram": None},
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Анна Иванова"
    assert a["gender"] == "other"
    assert a["instagram"] is None
    # Untouched fields survive a partial update.
    assert a["phone"] == "+79991234567"
    assert a["cardNumber"] == "CARD-001"


async def test_patch_customer_duplicate_phone_is_400(client, worker_token):
    await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    other = await client.post(
        "/api/v1/customers",
        json=_body(title="Второй", phone="+79995556677"),
        headers=_auth(worker_token),
    )
    other_id = other.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/customers/{other_id}",
        json={"data": {"attributes": {"phone": "+79991234567"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_patch_unknown_customer_is_404(client, worker_token):
    resp = await client.patch(
        "/api/v1/customers/does-not-exist",
        json={"data": {"attributes": {"title": "X"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


async def test_bonus_adjustment_writes_history(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]

    up = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"attributes": {"bonusBalance": 150}}},
        headers=_auth(worker_token),
    )
    assert up.status_code == 200
    assert up.json()["data"]["attributes"]["currentPoints"] == 150

    down = await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"attributes": {"bonusBalance": 100}}},
        headers=_auth(worker_token),
    )
    assert down.json()["data"]["attributes"]["currentPoints"] == 100

    hist = await client.get(
        f"/api/v1/customers/{cid}/bonus-history", headers=_auth(worker_token)
    )
    assert hist.status_code == 200
    entries = hist.json()["data"]
    amounts = sorted(e["attributes"]["amount"] for e in entries)
    assert amounts == [-50, 150]
    for e in entries:
        assert e["attributes"]["comment"] == "Корректировка"
        assert e["relationships"]["worker"]["data"] is not None


async def test_bonus_same_balance_writes_no_history(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]
    await client.patch(
        f"/api/v1/customers/{cid}",
        json={"data": {"attributes": {"bonusBalance": 0}}},
        headers=_auth(worker_token),
    )
    hist = await client.get(
        f"/api/v1/customers/{cid}/bonus-history", headers=_auth(worker_token)
    )
    assert hist.json()["data"] == []


# ---------- GET /v1/customers/{id}/stats ----------


async def test_stats_matches_orders_by_fk_and_by_phone(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]

    # Modern order: linked via FK, different contact phone.
    await _seed_order(
        customer_id=cid,
        phone="+70000000000",
        total_amount=3000,
        created_at=datetime(2026, 6, 1, 12, 0),
    )
    # Legacy ETL order: no FK, matched by the customer's phone.
    await _seed_order(
        phone="+79991234567",
        total_amount=1000,
        created_at=datetime(2026, 7, 4, 15, 30),
    )
    # Unrelated order must not leak in.
    await _seed_order(phone="+71112223344", total_amount=500)

    resp = await client.get(f"/api/v1/customers/{cid}/stats", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["ordersCount"] == 2
    assert a["ordersTotal"] == 4000
    assert a["avgCheck"] == 2000
    assert a["firstOrderAt"].startswith("2026-06-01")
    assert a["lastOrderAt"].startswith("2026-07-04")


async def test_stats_requires_auth(client):
    resp = await client.get("/api/v1/customers/whatever/stats")
    assert resp.status_code == 401


async def test_stats_unknown_customer_is_404(client, worker_token):
    resp = await client.get(
        "/api/v1/customers/does-not-exist/stats", headers=_auth(worker_token)
    )
    assert resp.status_code == 404


# ---------- GET /v1/customers/{id}/spend ----------


async def test_spend_groups_orders_by_day(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]

    await _seed_order(customer_id=cid, total_amount=1000, created_at=datetime(2026, 6, 10, 10, 0))
    await _seed_order(customer_id=cid, total_amount=500, created_at=datetime(2026, 6, 10, 18, 0))
    await _seed_order(customer_id=cid, total_amount=700, created_at=datetime(2026, 6, 12, 9, 0))
    # Outside the requested period.
    await _seed_order(customer_id=cid, total_amount=9999, created_at=datetime(2026, 7, 1, 9, 0))

    resp = await client.get(
        f"/api/v1/customers/{cid}/spend?filter[from]=2026-06-01&filter[to]=2026-06-30",
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["days"] == [
        {"date": "2026-06-10", "amount": 1500.0},
        {"date": "2026-06-12", "amount": 700.0},
    ]
    assert a["total"] == 2200


# ---------- GET /v1/customers (list aggregates) ----------


async def test_list_customers_aggregates_by_fk_and_phone(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]
    await _seed_order(customer_id=cid, phone="+70000000000", total_amount=2000)
    await _seed_order(phone="+79991234567", total_amount=1000)

    resp = await client.get("/api/v1/customers", headers=_auth(worker_token))
    row = next(c for c in resp.json()["data"] if c["id"] == cid)
    a = row["attributes"]
    assert a["ordersQty"] == 2
    assert a["ordersAmount"] == 3000
    assert a["averageCheck"] == 1500


# ---------- GET /v1/orders?filter[customer] ----------


async def test_orders_filter_by_customer(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]
    linked = await _seed_order(customer_id=cid, phone="+70000000000", total_amount=100)
    legacy = await _seed_order(phone="+79991234567", total_amount=200)
    await _seed_order(phone="+71112223344", total_amount=300)  # someone else's

    resp = await client.get(
        f"/api/v1/orders?filter[customer]={cid}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    ids = {o["id"] for o in resp.json()["data"]}
    assert ids == {linked, legacy}


# ---------- GET /v1/customers filters (admin-map §2.5.1 filter panel) ----------


async def test_list_customers_filters_by_customer_type(client, worker_token):
    person = await client.post(
        "/api/v1/customers", json=_body(customerType="person", phone="+79991110001"),
        headers=_auth(worker_token),
    )
    company = await client.post(
        "/api/v1/customers",
        json=_body(title="ООО Ромашка", customerType="company", phone="+79991110002"),
        headers=_auth(worker_token),
    )
    person_id = person.json()["data"]["id"]
    company_id = company.json()["data"]["id"]

    resp = await client.get(
        "/api/v1/customers?filter[customerType]=company", headers=_auth(worker_token)
    )
    ids = {c["id"] for c in resp.json()["data"]}
    assert company_id in ids
    assert person_id not in ids


async def test_list_customers_filters_by_preferences(client, worker_token):
    async with TestingSessionLocal() as db:
        pref = CustomerPreference(title="Пионы")
        db.add(pref)
        await db.commit()
        await db.refresh(pref)

    matching = await client.post(
        "/api/v1/customers",
        json=_body(preferences="Любит Пионы и тюльпаны", phone="+79992220001"),
        headers=_auth(worker_token),
    )
    other = await client.post(
        "/api/v1/customers",
        json=_body(title="Другой", preferences="Розы", phone="+79992220002"),
        headers=_auth(worker_token),
    )
    matching_id = matching.json()["data"]["id"]
    other_id = other.json()["data"]["id"]

    resp = await client.get(
        f"/api/v1/customers?filter[preferences]={pref.id}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    ids = {c["id"] for c in resp.json()["data"]}
    assert matching_id in ids
    assert other_id not in ids


async def test_list_customers_filters_by_unknown_preference_is_empty(client, worker_token):
    await client.post("/api/v1/customers", json=_body(phone="+79992220003"), headers=_auth(worker_token))
    resp = await client.get(
        "/api/v1/customers?filter[preferences]=does-not-exist", headers=_auth(worker_token)
    )
    assert resp.status_code == 200
    assert resp.json()["data"] == []


async def test_list_customers_filters_by_purchase_amount_range(client, worker_token):
    big_spender = await client.post(
        "/api/v1/customers", json=_body(phone="+79993330001"), headers=_auth(worker_token)
    )
    small_spender = await client.post(
        "/api/v1/customers", json=_body(title="Малый чек", phone="+79993330002"),
        headers=_auth(worker_token),
    )
    big_id = big_spender.json()["data"]["id"]
    small_id = small_spender.json()["data"]["id"]
    await _seed_order(customer_id=big_id, phone="+70000000001", total_amount=10000)
    await _seed_order(customer_id=small_id, phone="+70000000002", total_amount=500)

    resp = await client.get(
        "/api/v1/customers?filter[amountFrom]=5000", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    ids = {c["id"] for c in resp.json()["data"]}
    assert big_id in ids
    assert small_id not in ids

    resp2 = await client.get(
        "/api/v1/customers?filter[amountTo]=1000", headers=_auth(worker_token)
    )
    ids2 = {c["id"] for c in resp2.json()["data"]}
    assert small_id in ids2
    assert big_id not in ids2


async def test_list_customers_bad_amount_filter_is_400(client, worker_token):
    resp = await client.get(
        "/api/v1/customers?filter[amountFrom]=not-a-number", headers=_auth(worker_token)
    )
    assert resp.status_code == 400


# ---------- DELETE /v1/customers/{id} ----------


async def test_delete_customer_requires_auth(client):
    resp = await client.delete("/api/v1/customers/whatever")
    assert resp.status_code == 401


async def test_delete_unknown_customer_is_404(client, worker_token):
    resp = await client.delete(
        "/api/v1/customers/does-not-exist", headers=_auth(worker_token)
    )
    assert resp.status_code == 404


async def test_delete_customer_without_orders_succeeds(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/customers/{cid}", headers=_auth(worker_token))
    assert resp.status_code == 204

    check = await client.get(f"/api/v1/customers/{cid}", headers=_auth(worker_token))
    assert check.status_code == 404


async def test_delete_customer_with_orders_is_409(client, worker_token):
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]
    await _seed_order(customer_id=cid, phone="+70000000009", total_amount=100)

    resp = await client.delete(f"/api/v1/customers/{cid}", headers=_auth(worker_token))
    assert resp.status_code == 409
    assert "заказ" in resp.json()["detail"].lower()

    # Still there.
    check = await client.get(f"/api/v1/customers/{cid}", headers=_auth(worker_token))
    assert check.status_code == 200


async def test_delete_customer_with_legacy_phone_matched_order_is_409(client, worker_token):
    """Orders with no customer_id FK (legacy ETL rows) still block deletion —
    they're matched to the customer by phone, same as the stats/list endpoints."""
    created = await client.post("/api/v1/customers", json=_body(), headers=_auth(worker_token))
    cid = created.json()["data"]["id"]
    await _seed_order(phone="+79991234567", total_amount=100)  # no customer_id FK

    resp = await client.delete(f"/api/v1/customers/{cid}", headers=_auth(worker_token))
    assert resp.status_code == 409
