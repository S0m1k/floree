"""Источник сделки: channel codes + auto-assignment (admin-map §2.2.2).

Covers `get_or_create_deal_source` (resolve by code, adopt a title-only row
imported from Posiflora, create on first use) and the storefront checkout
stamping «Сайт» automatically — the same behaviour the future POS терминал
will rely on with code `terminal`.
"""

import pytest
from sqlalchemy import select

from app.dictionary_models import CustomerDealSource
from app.models import Order
from app.services.deal_sources import (
    SOURCE_SITE,
    SOURCE_TERMINAL,
    get_or_create_deal_source,
)
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_creates_source_on_first_use(client):
    async with TestingSessionLocal() as db:
        source = await get_or_create_deal_source(db, SOURCE_TERMINAL)
        await db.commit()
        assert source.code == "terminal"
        assert source.title == "Терминал"


@pytest.mark.asyncio
async def test_adopts_existing_title_only_row(client):
    # ETL-imported rows carry only a title — the helper must claim them
    # instead of creating a duplicate chip in the order form.
    async with TestingSessionLocal() as db:
        db.add(CustomerDealSource(id="ext-1", title="Терминал"))
        await db.commit()

    async with TestingSessionLocal() as db:
        source = await get_or_create_deal_source(db, SOURCE_TERMINAL)
        await db.commit()
        assert source.id == "ext-1"
        assert source.code == "terminal"


@pytest.mark.asyncio
async def test_resolves_by_code_before_title(client):
    async with TestingSessionLocal() as db:
        db.add(CustomerDealSource(id="coded", title="Старое имя", code="site"))
        db.add(CustomerDealSource(id="titled", title="Сайт"))
        await db.commit()

    async with TestingSessionLocal() as db:
        source = await get_or_create_deal_source(db, SOURCE_SITE)
        assert source.id == "coded"


@pytest.mark.asyncio
async def test_storefront_checkout_stamps_site_source(client):
    resp = await client.post(
        "/api/orders",
        json={
            "customer_name": "Тест",
            "phone": "+79990000000",
            "city": "Москва",
            "street": "Ленина",
            "house": "1",
            "items": [],
        },
    )
    assert resp.status_code == 200, resp.text

    order_id = resp.json()["id"]

    async with TestingSessionLocal() as db:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert order.source_id is not None
        source = (
            await db.execute(select(CustomerDealSource).where(CustomerDealSource.id == order.source_id))
        ).scalar_one()
        assert source.code == "site"
        assert source.title == "Сайт"
