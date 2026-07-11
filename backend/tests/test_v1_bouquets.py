"""Showcase bouquets — GET /v1/bouquets (list + summary meta) and
PATCH /v1/bouquets/{id} («Разобрать букет»), admin-map §2.3.1.

Money/status invariants under test:
- filter[status] narrows the list; meta (count/minPrice/maxPrice/totalSum)
  reflects the filtered set, not just the current page;
- sort supports amount/-amount/title/-title/createdAt/-createdAt;
- disassembling is only allowed from the showcase ("window") status — a sold
  bouquet is a completed sale (409), same for any other non-window status;
- everything requires auth (401).
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store, Bouquet
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    """A store with three showcase bouquets (window) + one already sold."""
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском", address="Невский пр., 1")
        db.add(store)
        await db.flush()
        rose = Bouquet(
            title="Розы",
            status="window",
            amount=3000,
            sale_amount=4700,
            store_id=store.id,
        )
        tulips = Bouquet(
            title="Тюльпаны",
            status="window",
            amount=1500,
            sale_amount=2200,
            store_id=store.id,
        )
        peonies = Bouquet(
            title="Пионы",
            status="window",
            amount=2000,
            sale_amount=3500,
            store_id=store.id,
        )
        sold = Bouquet(
            title="Проданный букет",
            status="sold",
            amount=1000,
            sale_amount=1800,
            store_id=store.id,
        )
        db.add_all([rose, tulips, peonies, sold])
        await db.commit()
        return {
            "store_id": store.id,
            "rose_id": rose.id,
            "tulips_id": tulips.id,
            "peonies_id": peonies.id,
            "sold_id": sold.id,
        }


# ---------- auth ----------

async def test_bouquets_endpoints_require_auth(client, seed):
    assert (await client.get("/api/v1/bouquets")).status_code == 401
    assert (
        await client.patch(f"/api/v1/bouquets/{seed['rose_id']}", json={})
    ).status_code == 401


# ---------- listing + filters ----------

async def test_filter_status_narrows_list(client, worker_token, seed):
    resp = await client.get(
        "/api/v1/bouquets?filter[status]=window", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    titles = {row["attributes"]["title"] for row in body["data"]}
    assert titles == {"Розы", "Тюльпаны", "Пионы"}

    resp_sold = await client.get(
        "/api/v1/bouquets?filter[status]=sold", headers=_auth(worker_token)
    )
    sold_titles = {row["attributes"]["title"] for row in resp_sold.json()["data"]}
    assert sold_titles == {"Проданный букет"}


async def test_filter_store_scopes_list(client, worker_token, seed):
    async with TestingSessionLocal() as db:
        other_store = Store(title="Другая точка")
        db.add(other_store)
        await db.commit()
        other_store_id = other_store.id

    resp = await client.get(
        f"/api/v1/bouquets?filter[store]={other_store_id}", headers=_auth(worker_token)
    )
    assert resp.json()["data"] == []


# ---------- summary meta ----------

async def test_meta_aggregates_reflect_filtered_set(client, worker_token, seed):
    resp = await client.get(
        "/api/v1/bouquets?filter[status]=window", headers=_auth(worker_token)
    )
    meta = resp.json()["meta"]
    assert meta["count"] == 3
    assert meta["minPrice"] == 2200.0
    assert meta["maxPrice"] == 4700.0
    assert meta["totalSum"] == 4700.0 + 2200.0 + 3500.0


async def test_meta_on_empty_result_has_zero_prices(client, worker_token, seed):
    resp = await client.get(
        "/api/v1/bouquets?filter[status]=disassembled", headers=_auth(worker_token)
    )
    meta = resp.json()["meta"]
    assert meta["count"] == 0
    assert meta["minPrice"] == 0.0
    assert meta["maxPrice"] == 0.0
    assert meta["totalSum"] == 0.0


# ---------- sorting ----------

async def test_sort_by_price_ascending(client, worker_token, seed):
    resp = await client.get(
        "/api/v1/bouquets?filter[status]=window&sort=amount", headers=_auth(worker_token)
    )
    titles = [row["attributes"]["title"] for row in resp.json()["data"]]
    assert titles == ["Тюльпаны", "Пионы", "Розы"]


async def test_sort_by_title_descending(client, worker_token, seed):
    resp = await client.get(
        "/api/v1/bouquets?filter[status]=window&sort=-title", headers=_auth(worker_token)
    )
    titles = [row["attributes"]["title"] for row in resp.json()["data"]]
    assert titles == ["Тюльпаны", "Розы", "Пионы"]


# ---------- disassembling ----------

async def test_disassemble_window_bouquet_succeeds(client, worker_token, seed):
    resp = await client.patch(
        f"/api/v1/bouquets/{seed['rose_id']}",
        json={"data": {"attributes": {"status": "disassembled"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["status"] == "disassembled"

    async with TestingSessionLocal() as db:
        row = (
            await db.execute(select(Bouquet).where(Bouquet.id == seed["rose_id"]))
        ).scalar_one()
        assert row.status == "disassembled"


async def test_disassemble_sold_bouquet_is_409(client, worker_token, seed):
    resp = await client.patch(
        f"/api/v1/bouquets/{seed['sold_id']}",
        json={"data": {"attributes": {"status": "disassembled"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 409


async def test_disassemble_unknown_bouquet_is_404(client, worker_token, seed):
    resp = await client.patch(
        "/api/v1/bouquets/does-not-exist",
        json={"data": {"attributes": {"status": "disassembled"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


async def test_disassemble_with_wrong_status_body_is_400(client, worker_token, seed):
    resp = await client.patch(
        f"/api/v1/bouquets/{seed['rose_id']}",
        json={"data": {"attributes": {"status": "sold"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
