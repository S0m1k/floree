"""Staff-control write operations — POST/PATCH /v1/workers, PATCH /v1/roles.

Covers the security invariants from docs/posiflora/admin-map.md §2.6:
- passwords and PINs are stored only as bcrypt hashes and never returned;
- PATCH keeps the current hash when the password/pin field is absent or empty;
- login is unique (duplicate → 400);
- roles PATCH validates the permissions JSON;
- everything requires a bearer token.
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store
from app.staff_models import Worker, Role
from app.services.auth import verify_password
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed_store(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Магазин на Невском", address="Невский, 1")
        db.add(store)
        await db.commit()
        return store.id


@pytest_asyncio.fixture
async def seed_role(client):
    async with TestingSessionLocal() as db:
        role = Role(title="Директор", is_system=False)
        db.add(role)
        await db.commit()
        return role.id


def _worker_body(store_id=None, role_id=None, **attr_overrides):
    attrs = {
        "firstName": "Анна",
        "surname": "Иванова",
        "patronymic": "Петровна",
        "phone": "+79991234567",
        "email": "anna@example.com",
        "login": "anna",
        "password": "s3cretpass",
        "pin": "1234",
        "accessRights": ["Флорист", "Менеджер по заказам"],
    }
    attrs.update(attr_overrides)
    rels = {}
    if store_id:
        rels["stores"] = {"data": [{"type": "stores", "id": store_id}]}
    if role_id:
        rels["role"] = {"data": {"type": "roles", "id": role_id}}
    return {"data": {"type": "workers", "attributes": attrs, "relationships": rels}}


# ---------- POST /v1/workers ----------


async def test_create_worker_requires_auth(client, seed_store):
    resp = await client.post("/api/v1/workers", json=_worker_body(seed_store))
    assert resp.status_code == 401


async def test_create_worker_hashes_password_and_pin(client, worker_token, seed_store):
    resp = await client.post(
        "/api/v1/workers", json=_worker_body(seed_store), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    a = data["attributes"]

    # Secrets never leave the server — only presence flags.
    assert "password" not in a and "passwordHash" not in a
    assert "pin" not in a and "pinHash" not in a
    assert a["hasPassword"] is True
    assert a["hasPin"] is True

    # name is assembled «Имя Фамилия» for the existing screens.
    assert a["name"] == "Анна Иванова"
    assert a["surname"] == "Иванова"
    assert a["accessRights"] == ["Флорист", "Менеджер по заказам"]
    assert a["storeIds"] == [seed_store]
    # store FK mirrors the first selected store.
    assert data["relationships"]["store"]["data"]["id"] == seed_store

    async with TestingSessionLocal() as db:
        w = (await db.execute(select(Worker).where(Worker.id == data["id"]))).scalar_one()
        # bcrypt hashes, not plaintext.
        assert w.password_hash != "s3cretpass" and w.password_hash.startswith("$2")
        assert w.pin_hash != "1234" and w.pin_hash.startswith("$2")
        assert verify_password("s3cretpass", w.password_hash)
        assert verify_password("1234", w.pin_hash)


async def test_create_worker_duplicate_login_is_400(client, worker_token, seed_store):
    first = await client.post(
        "/api/v1/workers", json=_worker_body(seed_store), headers=_auth(worker_token)
    )
    assert first.status_code == 201
    dup = await client.post(
        "/api/v1/workers", json=_worker_body(seed_store), headers=_auth(worker_token)
    )
    assert dup.status_code == 400
    assert "login" in dup.json()["detail"]


async def test_create_worker_requires_name_and_phone(client, worker_token, seed_store):
    no_surname = await client.post(
        "/api/v1/workers",
        json=_worker_body(seed_store, surname=""),
        headers=_auth(worker_token),
    )
    assert no_surname.status_code == 400
    no_phone = await client.post(
        "/api/v1/workers",
        json=_worker_body(seed_store, phone=""),
        headers=_auth(worker_token),
    )
    assert no_phone.status_code == 400


async def test_create_worker_invalid_pin_is_400(client, worker_token, seed_store):
    for bad_pin in ["12", "12345", "12ab"]:
        resp = await client.post(
            "/api/v1/workers",
            json=_worker_body(seed_store, login=f"login-{bad_pin}", pin=bad_pin),
            headers=_auth(worker_token),
        )
        assert resp.status_code == 400, bad_pin


async def test_create_worker_unknown_access_right_is_400(client, worker_token, seed_store):
    resp = await client.post(
        "/api/v1/workers",
        json=_worker_body(seed_store, accessRights=["Суперадмин"]),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_worker_unknown_store_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/workers",
        json=_worker_body("does-not-exist"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_worker_role_title_creates_role(client, worker_token, seed_store):
    body = _worker_body(seed_store, roleTitle="Старший флорист")
    resp = await client.post(
        "/api/v1/workers", json=body, headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    role_link = resp.json()["data"]["relationships"]["role"]["data"]
    assert role_link is not None

    roles = await client.get("/api/v1/roles", headers=_auth(worker_token))
    titles = [r["attributes"]["title"] for r in roles.json()["data"]]
    assert "Старший флорист" in titles


# ---------- PATCH /v1/workers/{id} ----------


async def _create(client, token, store_id, **overrides):
    resp = await client.post(
        "/api/v1/workers", json=_worker_body(store_id, **overrides), headers=_auth(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def test_patch_without_password_keeps_hash(client, worker_token, seed_store):
    worker_id = await _create(client, worker_token, seed_store)
    async with TestingSessionLocal() as db:
        before = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one()
        old_hash, old_pin_hash = before.password_hash, before.pin_hash

    # Edit form submits empty password/pin fields → «не менять».
    resp = await client.patch(
        f"/api/v1/workers/{worker_id}",
        json={
            "data": {
                "type": "workers",
                "attributes": {"firstName": "Анна", "surname": "Сидорова", "password": "", "pin": ""},
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["name"] == "Анна Сидорова"

    async with TestingSessionLocal() as db:
        after = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one()
        assert after.password_hash == old_hash
        assert after.pin_hash == old_pin_hash


async def test_patch_with_password_changes_hash(client, worker_token, seed_store):
    worker_id = await _create(client, worker_token, seed_store)
    resp = await client.patch(
        f"/api/v1/workers/{worker_id}",
        json={"data": {"attributes": {"password": "newpass99", "pin": "9876"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    async with TestingSessionLocal() as db:
        w = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one()
        assert verify_password("newpass99", w.password_hash)
        assert not verify_password("s3cretpass", w.password_hash)
        assert verify_password("9876", w.pin_hash)


async def test_patch_login_to_existing_is_400(client, worker_token, seed_store):
    await _create(client, worker_token, seed_store, login="first")
    second = await _create(client, worker_token, seed_store, login="second")
    resp = await client.patch(
        f"/api/v1/workers/{second}",
        json={"data": {"attributes": {"login": "first"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_patch_status_toggle(client, worker_token, seed_store):
    worker_id = await _create(client, worker_token, seed_store)
    suspended = await client.patch(
        f"/api/v1/workers/{worker_id}",
        json={"data": {"attributes": {"status": "inactive"}}},
        headers=_auth(worker_token),
    )
    assert suspended.status_code == 200
    assert suspended.json()["data"]["attributes"]["status"] == "inactive"

    bad = await client.patch(
        f"/api/v1/workers/{worker_id}",
        json={"data": {"attributes": {"status": "banana"}}},
        headers=_auth(worker_token),
    )
    assert bad.status_code == 400


async def test_patch_worker_requires_auth(client, seed_store):
    resp = await client.patch(
        "/api/v1/workers/whatever",
        json={"data": {"attributes": {"status": "inactive"}}},
    )
    assert resp.status_code == 401


async def test_patch_missing_worker_is_404(client, worker_token):
    resp = await client.patch(
        "/api/v1/workers/nope",
        json={"data": {"attributes": {"status": "inactive"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


# ---------- roles ----------


async def test_patch_role_permissions(client, worker_token, seed_role):
    permissions = {
        "orderDiscount": True,
        "orderMarkup": False,
        "bouquetDiscount": True,
        "bouquetMarkup": False,
        "customItemPrice": True,
    }
    resp = await client.patch(
        f"/api/v1/roles/{seed_role}",
        json={"data": {"type": "roles", "attributes": {"permissions": permissions}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["permissions"] == permissions

    fetched = await client.get(
        f"/api/v1/roles/{seed_role}", headers=_auth(worker_token)
    )
    assert fetched.json()["data"]["attributes"]["permissions"] == permissions


async def test_patch_role_unknown_permission_key_is_400(client, worker_token, seed_role):
    resp = await client.patch(
        f"/api/v1/roles/{seed_role}",
        json={"data": {"attributes": {"permissions": {"deleteEverything": True}}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_patch_role_non_bool_permission_is_400(client, worker_token, seed_role):
    resp = await client.patch(
        f"/api/v1/roles/{seed_role}",
        json={"data": {"attributes": {"permissions": {"orderDiscount": "yes"}}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_roles_require_auth(client, seed_role):
    listing = await client.get("/api/v1/roles")
    assert listing.status_code == 401
    patch = await client.patch(
        f"/api/v1/roles/{seed_role}",
        json={"data": {"attributes": {"permissions": None}}},
    )
    assert patch.status_code == 401


async def test_create_role_and_idempotent_by_title(client, worker_token):
    first = await client.post(
        "/api/v1/roles",
        json={"data": {"type": "roles", "attributes": {"title": "Курьер-стажёр"}}},
        headers=_auth(worker_token),
    )
    assert first.status_code == 201, first.text
    again = await client.post(
        "/api/v1/roles",
        json={"data": {"attributes": {"title": "Курьер-стажёр"}}},
        headers=_auth(worker_token),
    )
    # Same title → same role, no duplicate row.
    assert again.json()["data"]["id"] == first.json()["data"]["id"]


# ---------- shifts / devices (read-only stubs) ----------


async def test_shifts_and_devices_empty_lists(client, worker_token):
    shifts = await client.get("/api/v1/shifts", headers=_auth(worker_token))
    assert shifts.status_code == 200
    assert shifts.json()["data"] == []
    assert shifts.json()["meta"]["total"] == 0

    devices = await client.get("/api/v1/devices", headers=_auth(worker_token))
    assert devices.status_code == 200
    assert devices.json()["data"] == []


async def test_shifts_require_auth(client):
    resp = await client.get("/api/v1/shifts")
    assert resp.status_code == 401


async def test_login_flow_still_works_for_created_worker(client, worker_token, seed_store):
    """A worker created through the admin form must be able to log in."""
    await _create(client, worker_token, seed_store, login="newstaff", password="hunter22")
    resp = await client.post(
        "/api/v1/sessions",
        json={"data": {"attributes": {"username": "newstaff", "password": "hunter22"}}},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["accessToken"]
