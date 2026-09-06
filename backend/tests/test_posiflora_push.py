"""Delivery into the vendor Posiflora — deferred order push and its retry.

An order paid on the site must end up in Posiflora (CATALOG_SOURCE=posiflora):
either right away in the payment webhook, or via the background retry when the
first push failed. Callback requests («Собрать подобный») must reach Posiflora
too — florists don't watch our CRM in posiflora mode.
"""

import json

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import CallbackRequest, Order
from app.services import posiflora_push


def _stub_pf_order(order_id="pf-1", doc_no="D-1"):
    return {"data": {"id": order_id, "attributes": {"docNo": doc_no}}}


def _paid_order(**overrides) -> Order:
    fields = dict(
        customer_name="Иван",
        phone="+79990001122",
        address="Москва, Ленина, 1",
        total_amount=1500,
        payment_status="paid",
        posiflora_id=None,
        posiflora_doc_no="123",
        order_payload=json.dumps({"doc_no": "123"}),
        bouquet_ids="[]",
    )
    fields.update(overrides)
    return Order(**fields)


@pytest.mark.asyncio
async def test_fulfill_creates_order_and_records_payment(monkeypatch):
    monkeypatch.setattr(settings, "catalog_source", "posiflora")
    created, payments = [], []

    async def fake_create(**kwargs):
        created.append(kwargs)
        return _stub_pf_order()

    async def fake_record(pf_id, amount):
        payments.append((pf_id, amount))

    monkeypatch.setattr(posiflora_push, "posiflora_create_order", fake_create)
    monkeypatch.setattr(posiflora_push, "record_payment", fake_record)

    order = _paid_order()
    await posiflora_push.fulfill_order_in_posiflora(order, 1500.0)

    assert order.posiflora_id == "pf-1"
    assert order.posiflora_doc_no == "D-1"
    assert created == [{"doc_no": "123"}]
    assert payments == [("pf-1", 1500.0)]


@pytest.mark.asyncio
async def test_fulfill_never_raises_and_leaves_order_for_retry(monkeypatch):
    monkeypatch.setattr(settings, "catalog_source", "posiflora")

    async def fake_create(**kwargs):
        raise Exception("posiflora down")

    monkeypatch.setattr(posiflora_push, "posiflora_create_order", fake_create)

    order = _paid_order()
    await posiflora_push.fulfill_order_in_posiflora(order, 1500.0)  # no raise
    assert order.posiflora_id is None  # retry loop will pick it up


@pytest.mark.asyncio
async def test_fulfill_noop_in_local_mode(monkeypatch):
    monkeypatch.setattr(settings, "catalog_source", "local")

    async def boom(**kwargs):
        raise AssertionError("must not call Posiflora in local mode")

    monkeypatch.setattr(posiflora_push, "posiflora_create_order", boom)

    order = _paid_order()
    await posiflora_push.fulfill_order_in_posiflora(order, 1500.0)
    assert order.posiflora_id is None


@pytest.mark.asyncio
async def test_retry_pushes_only_stuck_paid_orders(monkeypatch, client):
    from tests.conftest import TestingSessionLocal

    monkeypatch.setattr(settings, "catalog_source", "posiflora")

    stuck = _paid_order()
    unpaid = _paid_order(payment_status="pending")
    delivered = _paid_order(posiflora_id="pf-already")
    async with TestingSessionLocal() as db:
        db.add_all([stuck, unpaid, delivered])
        await db.commit()
        stuck_id = stuck.id

    created = []

    async def fake_create(**kwargs):
        created.append(kwargs)
        return _stub_pf_order(order_id="pf-retried")

    async def fake_record(pf_id, amount):
        pass

    monkeypatch.setattr(posiflora_push, "posiflora_create_order", fake_create)
    monkeypatch.setattr(posiflora_push, "record_payment", fake_record)

    # Point the retry at the test DB session factory.
    import app.database

    monkeypatch.setattr(app.database, "AsyncSessionLocal", TestingSessionLocal)

    pushed = await posiflora_push.retry_unpushed_orders()

    assert pushed == 1
    assert len(created) == 1
    async with TestingSessionLocal() as db:
        refreshed = (
            await db.execute(select(Order).where(Order.id == stuck_id))
        ).scalar_one()
        assert refreshed.posiflora_id == "pf-retried"


@pytest.mark.asyncio
async def test_callback_request_pushed_to_posiflora(monkeypatch, client):
    from tests.conftest import TestingSessionLocal

    monkeypatch.setattr(settings, "catalog_source", "posiflora")
    pushed = []

    async def fake_callback_order(**kwargs):
        pushed.append(kwargs)
        return _stub_pf_order()

    import app.routers.callbacks as callbacks_router

    monkeypatch.setattr(callbacks_router, "create_callback_order", fake_callback_order)

    resp = await client.post(
        "/api/callback-requests",
        json={
            "name": "Мария",
            "phone": "+79990001122",
            "contact_method": "Telegram",
            "recipe_title": "Букет №152",
        },
    )
    assert resp.status_code == 200

    assert pushed == [
        {
            "name": "Мария",
            "phone": "+79990001122",
            "contact_method": "Telegram",
            "recipe_title": "Букет №152",
        }
    ]
    async with TestingSessionLocal() as db:
        row = (await db.execute(select(CallbackRequest))).scalars().first()
        assert row is not None and row.name == "Мария"


@pytest.mark.asyncio
async def test_callback_saved_even_when_posiflora_fails(monkeypatch, client):
    monkeypatch.setattr(settings, "catalog_source", "posiflora")

    async def fake_callback_order(**kwargs):
        raise Exception("posiflora down")

    import app.routers.callbacks as callbacks_router

    monkeypatch.setattr(callbacks_router, "create_callback_order", fake_callback_order)

    resp = await client.post(
        "/api/callback-requests",
        json={"name": "Пётр", "phone": "+79990001133", "contact_method": "Позвонить"},
    )
    assert resp.status_code == 200  # CRM copy saved, vendor failure only logged
