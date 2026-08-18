"""CATALOG_SOURCE — which shop the public storefront talks to.

`posiflora` proxies the vendor Posiflora live (the floree.ru mode while Фаза 6
is unfinished); `local` serves our own imported database. Every storefront
surface has to agree on the answer, so this covers all three: catalog reads,
the server-side pricing that decides what the buyer is charged, and the
paid-order push that puts the order in front of a florist.
"""

import json

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import Order, Payment
from app.routers import payments as payments_router
from app.services import posiflora
from tests.conftest import TestingSessionLocal


@pytest.fixture
def posiflora_mode(monkeypatch):
    monkeypatch.setattr(settings, "catalog_source", "posiflora")


@pytest.fixture
def local_mode(monkeypatch):
    monkeypatch.setattr(settings, "catalog_source", "local")


# ---------- catalog reads ----------


@pytest.mark.asyncio
async def test_categories_come_from_vendor_in_posiflora_mode(
    client, posiflora_mode, monkeypatch
):
    async def fake_categories():
        return {
            "data": [{"id": "vendor-cat", "type": "categories"}],
            "meta": {"total": 1},
        }

    monkeypatch.setattr(posiflora, "get_recipe_categories", fake_categories)

    resp = await client.get("/api/recipe-categories")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"][0]["id"] == "vendor-cat"


@pytest.mark.asyncio
async def test_categories_come_from_our_db_in_local_mode(
    client, local_mode, monkeypatch
):
    async def must_not_be_called():
        raise AssertionError("local mode must not call the vendor Posiflora")

    monkeypatch.setattr(posiflora, "get_recipe_categories", must_not_be_called)

    resp = await client.get("/api/recipe-categories")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == []  # empty DB, and no vendor call


@pytest.mark.asyncio
async def test_vendor_outage_surfaces_as_502(client, posiflora_mode, monkeypatch):
    async def boom(recipe_id):
        raise Exception("Posiflora error 503: upstream down")

    monkeypatch.setattr(posiflora, "get_recipe", boom)

    resp = await client.get("/api/recipes/whatever")

    assert resp.status_code == 502


# ---------- order pricing ----------


def _order_body(items: list[dict]) -> dict:
    return {
        "customer_name": "Тест",
        "phone": "+79990000000",
        "city": "Москва",
        "street": "Ленина",
        "house": "1",
        "items": items,
    }


@pytest.mark.asyncio
async def test_order_is_priced_from_the_vendor_not_the_client(
    client, posiflora_mode, monkeypatch
):
    """The client claims 1 ₽ a piece; the vendor says 5000 ₽. The vendor wins."""

    async def fake_prices(recipe_id):
        assert recipe_id == "rec-1"
        return {"prices": {"swv-1": 5000}, "default_swv_id": "swv-1"}

    monkeypatch.setattr(posiflora, "get_recipe_variant_prices", fake_prices)

    resp = await client.post(
        "/api/orders",
        json=_order_body(
            [
                {
                    "recipe_id": "rec-1",
                    "title": "Букет",
                    "price": 1,
                    "qty": 2,
                    "swv_id": "swv-1",
                }
            ]
        ),
    )

    assert resp.status_code == 200, resp.text
    assert float(resp.json()["total_amount"]) == 10000


@pytest.mark.asyncio
async def test_order_is_rejected_when_the_vendor_price_is_unverifiable(
    client, posiflora_mode, monkeypatch
):
    async def boom(recipe_id):
        raise Exception("Posiflora unreachable")

    monkeypatch.setattr(posiflora, "get_recipe_variant_prices", boom)

    resp = await client.post(
        "/api/orders",
        json=_order_body(
            [{"recipe_id": "rec-1", "title": "Букет", "price": 1, "qty": 1}]
        ),
    )

    # Fails closed — an unverified price is never charged.
    assert resp.status_code == 502


# ---------- paid-order fulfilment ----------

_ORDER_PAYLOAD = {
    "customer_name": "Тест",
    "phone": "+79990000000",
    "city": "Москва",
    "street": "Ленина",
    "house": "1",
    "apartment": None,
    "delivery_date": None,
    "delivery_time": None,
    "comment": None,
    "items": [{"recipe_id": "rec-1", "title": "Букет", "price": 1000, "qty": 1}],
    "doc_no": "123456",
    "promo_code": None,
    "discount_total": 0,
}


async def _seed_pending_order(order_payload: dict) -> str:
    """Persist a pending order plus its payment row, the way checkout does."""
    async with TestingSessionLocal() as db:
        order = Order(
            customer_name="Тест",
            phone="+79990000000",
            address="Москва, Ленина, 1",
            total_amount=1000,
            payment_status="pending",
            posiflora_doc_no="123456",
            bouquet_ids=json.dumps(order_payload["items"]),
            order_payload=json.dumps(order_payload),
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        db.add(
            Payment(
                order_id=order.id,
                tbank_order_id=order.id,
                tbank_payment_id="pay-1",
                amount=1000,
                status="NEW",
            )
        )
        await db.commit()
        return order.id


async def _confirm_payment(client, order_id: str):
    return await client.post(
        "/api/payments/webhook",
        json={
            "OrderId": order_id,
            "Status": "CONFIRMED",
            "PaymentId": "pay-1",
            "Amount": 100000,  # kopecks — matches the 1000 ₽ order
            "Token": "stubbed",
        },
    )


async def _load_order(order_id: str) -> Order:
    async with TestingSessionLocal() as db:
        return (
            await db.execute(select(Order).where(Order.id == order_id))
        ).scalar_one()


@pytest.mark.asyncio
async def test_paid_order_reaches_the_vendor_in_posiflora_mode(
    client, posiflora_mode, monkeypatch
):
    monkeypatch.setattr(payments_router, "verify_notification", lambda *a, **k: True)

    created: dict = {}
    recorded: dict = {}

    async def fake_create_order(**kwargs):
        created.update(kwargs)
        return {"data": {"id": "pf-order-1", "attributes": {"docNo": "998877"}}}

    async def fake_record_payment(pf_order_id, amount):
        recorded.update({"id": pf_order_id, "amount": amount})
        return {}

    monkeypatch.setattr(payments_router, "posiflora_create_order", fake_create_order)
    monkeypatch.setattr(payments_router, "record_payment", fake_record_payment)

    order_id = await _seed_pending_order(_ORDER_PAYLOAD)
    resp = await _confirm_payment(client, order_id)
    assert resp.status_code == 200

    assert created["doc_no"] == "123456"
    assert recorded == {"id": "pf-order-1", "amount": 1000.0}

    order = await _load_order(order_id)
    assert order.payment_status == "paid"
    assert order.posiflora_id == "pf-order-1"
    assert order.posiflora_doc_no == "998877"  # vendor's own number wins


@pytest.mark.asyncio
async def test_paid_order_stays_in_our_crm_in_local_mode(
    client, local_mode, monkeypatch
):
    monkeypatch.setattr(payments_router, "verify_notification", lambda *a, **k: True)

    async def must_not_be_called(**kwargs):
        raise AssertionError("local mode must not push orders to the vendor")

    monkeypatch.setattr(payments_router, "posiflora_create_order", must_not_be_called)

    order_id = await _seed_pending_order(_ORDER_PAYLOAD)
    resp = await _confirm_payment(client, order_id)
    assert resp.status_code == 200

    order = await _load_order(order_id)
    assert order.payment_status == "paid"
    assert order.posiflora_id is None


@pytest.mark.asyncio
async def test_vendor_failure_keeps_the_payment_and_stays_retryable(
    client, posiflora_mode, monkeypatch
):
    """The money is already taken — a vendor outage must not fail the webhook.

    A non-OK reply makes T-Bank retry and leaves the buyer on an error page,
    so the push failure is swallowed and `posiflora_id` left empty for a retry.
    """
    monkeypatch.setattr(payments_router, "verify_notification", lambda *a, **k: True)

    async def boom(**kwargs):
        raise Exception("Posiflora 500")

    monkeypatch.setattr(payments_router, "posiflora_create_order", boom)

    order_id = await _seed_pending_order(_ORDER_PAYLOAD)
    resp = await _confirm_payment(client, order_id)

    assert resp.status_code == 200
    assert resp.text == "OK"

    order = await _load_order(order_id)
    assert order.payment_status == "paid"
    assert order.posiflora_id is None


@pytest.mark.asyncio
async def test_promo_order_still_reaches_the_vendor(
    client, posiflora_mode, monkeypatch
):
    """Regression guard for the promo fields stashed in `order_payload`.

    Checkout has stashed `promo_code`/`discount_total` since the ШКОЛА promo
    landed. A `create_order` that doesn't accept them raises TypeError, and
    every discounted order would silently never reach the florist — so this
    exercises the real `create_order`, stubbing only the HTTP layer.
    """
    monkeypatch.setattr(payments_router, "verify_notification", lambda *a, **k: True)

    async def fake_record_payment(*args, **kwargs):
        return {}

    async def fake_bouquet(**kwargs):
        return "bouquet-1"

    captured: dict = {}

    async def fake_request(method, path, **kwargs):
        captured["json"] = kwargs.get("json")
        return {"data": {"id": "pf-1", "attributes": {"docNo": "1"}}}

    monkeypatch.setattr(payments_router, "record_payment", fake_record_payment)
    monkeypatch.setattr(posiflora, "_create_bouquet_from_recipe", fake_bouquet)
    monkeypatch.setattr(posiflora, "posiflora_request", fake_request)

    order_id = await _seed_pending_order(
        {**_ORDER_PAYLOAD, "promo_code": "ШКОЛА", "discount_total": 150}
    )
    resp = await _confirm_payment(client, order_id)
    assert resp.status_code == 200

    # The florist sees why the recorded payment is below the catalog total.
    comments = captured["json"]["data"]["attributes"]["deliveryComments"]
    assert "ШКОЛА" in comments
    assert "150" in comments

    order = await _load_order(order_id)
    assert order.posiflora_id == "pf-1"
