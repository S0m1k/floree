"""Vendor CRUD — admin «Учёт и финансы → Поставщики» (admin-map.md §2.4.4).

- title is required (and length-capped); phone/email/comment are optional
  with sane length caps.
- system vendors (Прямая поставка, Уценка, …) can't be deleted (400).
- a vendor referenced by a packing invoice can't be deleted (409).
- everything requires auth (401).
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store
from app.inventory_models import Vendor, PackingInvoice
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском")
        system_vendor = Vendor(title="Уценка", is_system=True)
        db.add_all([store, system_vendor])
        await db.commit()
        return {"store_id": store.id, "system_vendor_id": system_vendor.id}


# ---------- auth ----------

async def test_vendor_writes_require_auth(client, seed):
    assert (await client.post("/api/v1/vendors", json={})).status_code == 401
    assert (await client.patch("/api/v1/vendors/x", json={})).status_code == 401
    assert (await client.delete("/api/v1/vendors/x")).status_code == 401


# ---------- create ----------

async def test_create_vendor(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/vendors",
        json={
            "data": {
                "type": "vendors",
                "attributes": {
                    "title": "ООО Цветочная база",
                    "phone": "+79991234567",
                    "email": "base@example.com",
                    "description": "Основной поставщик роз",
                },
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "ООО Цветочная база"
    assert a["phone"] == "+79991234567"
    assert a["email"] == "base@example.com"
    assert a["description"] == "Основной поставщик роз"


async def test_create_vendor_requires_title(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/vendors",
        json={"data": {"type": "vendors", "attributes": {"phone": "123"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_vendor_title_too_long_is_400(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/vendors",
        json={"data": {"type": "vendors", "attributes": {"title": "x" * 256}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


# ---------- update ----------

async def test_update_vendor_partial(client, worker_token, seed):
    created = await client.post(
        "/api/v1/vendors",
        json={"data": {"type": "vendors", "attributes": {"title": "Поставщик А", "phone": "111"}}},
        headers=_auth(worker_token),
    )
    vendor_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/vendors/{vendor_id}",
        json={"data": {"type": "vendors", "attributes": {"phone": "222"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Поставщик А"  # untouched
    assert a["phone"] == "222"


async def test_update_unknown_vendor_is_404(client, worker_token, seed):
    resp = await client.patch(
        "/api/v1/vendors/nope",
        json={"data": {"attributes": {"phone": "1"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


# ---------- delete ----------

async def test_delete_vendor(client, worker_token, seed):
    created = await client.post(
        "/api/v1/vendors",
        json={"data": {"type": "vendors", "attributes": {"title": "Удаляемый поставщик"}}},
        headers=_auth(worker_token),
    )
    vendor_id = created.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/vendors/{vendor_id}", headers=_auth(worker_token))
    assert resp.status_code == 204

    async with TestingSessionLocal() as db:
        row = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
        assert row is None


async def test_delete_system_vendor_is_400(client, worker_token, seed):
    resp = await client.delete(
        f"/api/v1/vendors/{seed['system_vendor_id']}", headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_delete_vendor_with_linked_docs_is_409(client, worker_token, seed):
    created = await client.post(
        "/api/v1/vendors",
        json={"data": {"type": "vendors", "attributes": {"title": "Занятый поставщик"}}},
        headers=_auth(worker_token),
    )
    vendor_id = created.json()["data"]["id"]

    async with TestingSessionLocal() as db:
        db.add(PackingInvoice(store_id=seed["store_id"], vendor_id=vendor_id, status="draft"))
        await db.commit()

    resp = await client.delete(f"/api/v1/vendors/{vendor_id}", headers=_auth(worker_token))
    assert resp.status_code == 409
