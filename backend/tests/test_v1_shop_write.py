"""Онлайн-витрина — /admin/shop-settings (admin-map.md §2.3.2).

Covers: GET bootstraps the singleton `shop_settings` row (same pattern as
`personal_data_templates`), PUT does a partial update with email/phone
validation, a repeated GET returns the same single row, /v1/shop-summary
counts published recipes/items and orders from the storefront source over
the last 7 days, and auth is required on every endpoint.
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.catalog_models import Specification
from app.dictionary_models import ShopSettings, CustomerDealSource
from app.inventory_models import Item
from app.models import Order
from app.staff_models import Worker
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- shop-settings (singleton form) ----------


async def test_shop_settings_requires_auth(client):
    assert (await client.get("/api/v1/shop-settings")).status_code == 401
    assert (
        await client.put("/api/v1/shop-settings", json={"data": {"attributes": {}}})
    ).status_code == 401


async def test_shop_summary_requires_auth(client):
    assert (await client.get("/api/v1/shop-summary")).status_code == 401


async def test_shop_settings_get_bootstraps_empty_singleton(client, worker_token):
    resp = await client.get("/api/v1/shop-settings", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["id"] == ShopSettings.SINGLETON_ID
    a = data["attributes"]
    assert a["shopTitle"] is None
    assert a["phone"] is None
    assert a["address"] is None
    assert a["emailOrders"] is None
    assert a["instagram"] is None
    assert a["telegram"] is None
    assert a["whatsapp"] is None
    assert a["isEnabled"] is True
    assert a["announcement"] is None


async def test_shop_settings_put_roundtrip(client, worker_token):
    resp = await client.put(
        "/api/v1/shop-settings",
        json={
            "data": {
                "attributes": {
                    "shopTitle": "Floree",
                    "phone": "+7 900 123-45-67",
                    "address": "Санкт-Петербург, Невский пр., 1",
                    "emailOrders": "orders@floree.ru",
                    "instagram": "floree.ru",
                    "telegram": "@floree_bot",
                    "whatsapp": "+79001234567",
                    "isEnabled": False,
                    "announcement": "Скидка 10% на розы",
                }
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["shopTitle"] == "Floree"
    assert a["phone"] == "+7 900 123-45-67"
    assert a["emailOrders"] == "orders@floree.ru"
    assert a["isEnabled"] is False
    assert a["announcement"] == "Скидка 10% на розы"

    # Singleton: a second GET returns the same row, not a new empty one.
    again = await client.get("/api/v1/shop-settings", headers=_auth(worker_token))
    assert again.json()["data"]["attributes"]["shopTitle"] == "Floree"
    assert again.json()["data"]["id"] == ShopSettings.SINGLETON_ID

    async with TestingSessionLocal() as db:
        from sqlalchemy import select, func

        count = (
            await db.execute(select(func.count()).select_from(ShopSettings))
        ).scalar_one()
        assert count == 1


async def test_shop_settings_partial_put_keeps_other_fields(client, worker_token):
    await client.put(
        "/api/v1/shop-settings",
        json={"data": {"attributes": {"shopTitle": "Floree", "phone": "9001234567"}}},
        headers=_auth(worker_token),
    )
    resp = await client.put(
        "/api/v1/shop-settings",
        json={"data": {"attributes": {"address": "Мск, Тверская, 1"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["shopTitle"] == "Floree"
    assert a["phone"] == "9001234567"
    assert a["address"] == "Мск, Тверская, 1"


@pytest.mark.parametrize("bad_email", ["not-an-email", "foo@", "@bar.com", "foo bar@baz.com"])
async def test_shop_settings_invalid_email_is_400(client, worker_token, bad_email):
    resp = await client.put(
        "/api/v1/shop-settings",
        json={"data": {"attributes": {"emailOrders": bad_email}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.parametrize("bad_phone", ["123", "1234567890123456", "abc"])
async def test_shop_settings_invalid_phone_is_400(client, worker_token, bad_phone):
    resp = await client.put(
        "/api/v1/shop-settings",
        json={"data": {"attributes": {"phone": bad_phone}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.parametrize("good_phone", ["1234", "+7 900 123-45-67", "123456789012345"])
async def test_shop_settings_valid_phone_lengths(client, worker_token, good_phone):
    resp = await client.put(
        "/api/v1/shop-settings",
        json={"data": {"attributes": {"phone": good_phone}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text


# ---------- shop-summary ----------


@pytest_asyncio.fixture
async def summary_seed(client):
    async with TestingSessionLocal() as db:
        published = Specification(title="Букет опубликован", public=True, status="on")
        published_off = Specification(title="Букет выключен", public=True, status="off")
        unpublished = Specification(title="Черновик", public=False, status="on")
        deleted = Specification(title="Удалён", public=True, status="deleted")
        item_public = Item(title="Ваза", public=True, status="on")
        item_private = Item(title="Открытка", public=False, status="on")
        website_source = CustomerDealSource(title="Сайт")
        other_source = CustomerDealSource(title="Телефон")
        db.add_all(
            [
                published,
                published_off,
                unpublished,
                deleted,
                item_public,
                item_private,
                website_source,
                other_source,
            ]
        )
        await db.commit()

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        recent_website_order = Order(
            customer_name="Клиент",
            phone="+70000000000",
            address="",
            total_amount=1500,
            bouquet_ids="[]",
            source_id=website_source.id,
            created_at=now - timedelta(days=1),
        )
        old_website_order = Order(
            customer_name="Клиент",
            phone="+70000000000",
            address="",
            total_amount=1500,
            bouquet_ids="[]",
            source_id=website_source.id,
            created_at=now - timedelta(days=30),
        )
        other_source_order = Order(
            customer_name="Клиент",
            phone="+70000000000",
            address="",
            total_amount=1500,
            bouquet_ids="[]",
            source_id=other_source.id,
            created_at=now - timedelta(days=1),
        )
        db.add_all([recent_website_order, old_website_order, other_source_order])
        await db.commit()


async def test_shop_summary_counts(client, worker_token, summary_seed):
    resp = await client.get("/api/v1/shop-summary", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    # 4 specs seeded, 1 soft-deleted → excluded from the total.
    assert a["totalRecipes"] == 3
    # Only public=True AND status='on'.
    assert a["publishedRecipes"] == 1
    # Only Item.public=True (status!='deleted').
    assert a["publishedItems"] == 1
    # Only the order tied to the "Сайт" source within the last 7 days.
    assert a["lastOrders"] == 1
    assert a["lastOrdersSourceFound"] is True


async def test_shop_summary_no_website_source_reports_zero(client, worker_token):
    async with TestingSessionLocal() as db:
        other_source = CustomerDealSource(title="AmoCRM")
        db.add(other_source)
        await db.commit()
        order = Order(
            customer_name="Клиент",
            phone="+70000000000",
            address="",
            total_amount=1500,
            bouquet_ids="[]",
            source_id=other_source.id,
        )
        db.add(order)
        await db.commit()

    resp = await client.get("/api/v1/shop-summary", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["lastOrders"] == 0
    assert a["lastOrdersSourceFound"] is False
