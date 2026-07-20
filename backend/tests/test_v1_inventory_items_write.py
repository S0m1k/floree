"""Catalog item CRUD — admin «Каталог товаров и услуг» (admin-map.md §2.3.4).

- title is required (and length-capped); category/measure must reference
  existing rows; minPrice/maxPrice are numbers >= 0 with max >= min;
  barcode must be unique when set.
- delete is a soft delete (status -> 'deleted') and is refused (409) while
  the item is referenced by a warehouse document line, a recipe composition,
  or an order line.
- barcode generation is idempotent and produces a valid EAN-13 check digit.
- everything requires auth (401).
"""

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Category, SpecificationComposition, SpecificationWithVariants, SpecificationVariant, Specification, Store
from app.dictionary_models import UnitOfMeasure
from app.inventory_models import Item, PackingInvoice, PackingInvoiceItem, Vendor
from app.models import Order, OrderItem
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        store = Store(title="Точка на Невском")
        category = Category(title="Цветы")
        measure = UnitOfMeasure(title="Штука", short_name="шт")
        db.add_all([store, category, measure])
        await db.commit()
        return {"store_id": store.id, "category_id": category.id, "measure_id": measure.id}


def _create_body(**overrides):
    attrs = {
        "title": "Роза красная 60см",
        "itemType": "item",
        "priceMin": 100,
        "priceMax": 150,
        "public": True,
        "status": "on",
    }
    attrs.update(overrides.pop("attributes", {}))
    body = {"data": {"type": "inventory-items", "attributes": attrs}}
    if overrides.get("relationships"):
        body["data"]["relationships"] = overrides["relationships"]
    return body


# ---------- auth ----------

async def test_item_writes_require_auth(client, seed):
    assert (await client.post("/api/v1/inventory-items", json={})).status_code == 401
    assert (await client.patch("/api/v1/inventory-items/x", json={})).status_code == 401
    assert (await client.delete("/api/v1/inventory-items/x")).status_code == 401
    assert (await client.post("/api/v1/inventory-items/x/barcode")).status_code == 401


# ---------- create ----------

async def test_create_item(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(relationships={
            "category": {"data": {"type": "categories", "id": seed["category_id"]}},
            "measure": {"data": {"type": "measures", "id": seed["measure_id"]}},
        }),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Роза красная 60см"
    assert a["priceMin"] == 100
    assert a["priceMax"] == 150
    assert a["status"] == "on"
    rels = resp.json()["data"]["relationships"]
    assert rels["category"]["data"]["id"] == seed["category_id"]
    assert rels["measure"]["data"]["id"] == seed["measure_id"]


async def test_create_item_requires_title(client, worker_token, seed):
    body = _create_body()
    body["data"]["attributes"].pop("title")
    resp = await client.post("/api/v1/inventory-items", json=body, headers=_auth(worker_token))
    assert resp.status_code == 400


async def test_create_item_rejects_unknown_category(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(relationships={"category": {"data": {"type": "categories", "id": "nope"}}}),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_item_rejects_max_below_min(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(attributes={"priceMin": 200, "priceMax": 100}),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_item_rejects_negative_price(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(attributes={"priceMin": -1, "priceMax": 10}),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_item_rejects_unknown_item_type(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(attributes={"itemType": "bouquet"}),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_item_duplicate_barcode_is_400(client, worker_token, seed):
    first = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(attributes={"barcode": "4600000000001"}),
        headers=_auth(worker_token),
    )
    assert first.status_code == 201, first.text

    dup = await client.post(
        "/api/v1/inventory-items",
        json=_create_body(attributes={"title": "Другой товар", "barcode": "4600000000001"}),
        headers=_auth(worker_token),
    )
    assert dup.status_code == 400


# ---------- update ----------

async def test_update_item_partial(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"data": {"attributes": {"priceMax": 999}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Роза красная 60см"  # untouched
    assert a["priceMax"] == 999


async def test_update_unknown_item_is_404(client, worker_token, seed):
    resp = await client.patch(
        "/api/v1/inventory-items/nope",
        json={"data": {"attributes": {"title": "x"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 404


async def test_update_item_rejects_max_below_min(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"data": {"attributes": {"priceMin": 500}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


# ---------- delete ----------

async def test_delete_item_soft_deletes(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attributes"]["status"] == "deleted"

    async with TestingSessionLocal() as db:
        row = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
        assert row is not None  # row stays — soft delete, not a hard delete
        assert row.status == "deleted"

    # Soft-deleted items drop out of the catalog list.
    listed = await client.get("/api/v1/inventory-items", headers=_auth(worker_token))
    assert item_id not in {row["id"] for row in listed.json()["data"]}


async def test_delete_unknown_item_is_404(client, worker_token, seed):
    resp = await client.delete("/api/v1/inventory-items/nope", headers=_auth(worker_token))
    assert resp.status_code == 404


async def test_delete_item_used_in_packing_invoice_is_409(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    async with TestingSessionLocal() as db:
        vendor = Vendor(title="Поставщик")
        db.add(vendor)
        await db.flush()
        invoice = PackingInvoice(store_id=seed["store_id"], vendor_id=vendor.id, status="draft")
        db.add(invoice)
        await db.flush()
        db.add(PackingInvoiceItem(invoice_id=invoice.id, item_id=item_id, quantity=1, price=10, amount=10))
        await db.commit()

    resp = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_item_used_in_recipe_composition_is_409(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    async with TestingSessionLocal() as db:
        spec = Specification(title="Букет №1", status="on", public=False)
        db.add(spec)
        await db.flush()
        variant = SpecificationVariant(title="Вариант 1")
        db.add(variant)
        await db.flush()
        swv = SpecificationWithVariants(specification_id=spec.id, variant_id=variant.id, is_default=True, status="on")
        db.add(swv)
        await db.flush()
        db.add(SpecificationComposition(spec_with_variants_id=swv.id, item_id=item_id, quantity=1, position=0))
        await db.commit()

    resp = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


async def test_delete_item_used_in_order_is_409(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    async with TestingSessionLocal() as db:
        order = Order(
            store_id=seed["store_id"], status="new",
            customer_name="Тестовый клиент", phone="+79990000000", address="ул. Тестовая, 1",
            bouquet_ids="[]",
        )
        db.add(order)
        await db.flush()
        db.add(OrderItem(
            order_id=order.id, kind="item", inventory_item_id=item_id,
            title="Роза красная 60см", unit_price=100, quantity=1,
        ))
        await db.commit()

    resp = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=_auth(worker_token))
    assert resp.status_code == 409


# ---------- barcode generation ----------

def _ean13_is_valid(code: str) -> bool:
    if len(code) != 13 or not code.isdigit():
        return False
    total = 0
    for idx, ch in enumerate(code[:12]):
        digit = int(ch)
        total += digit * (3 if idx % 2 == 1 else 1)
    check = (10 - (total % 10)) % 10
    return check == int(code[12])


async def test_generate_barcode_creates_valid_ean13(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    resp = await client.post(f"/api/v1/inventory-items/{item_id}/barcode", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    barcode = resp.json()["data"]["attributes"]["barcode"]
    assert barcode is not None
    assert _ean13_is_valid(barcode)


async def test_generate_barcode_is_idempotent(client, worker_token, seed):
    created = await client.post(
        "/api/v1/inventory-items", json=_create_body(), headers=_auth(worker_token)
    )
    item_id = created.json()["data"]["id"]

    first = await client.post(f"/api/v1/inventory-items/{item_id}/barcode", headers=_auth(worker_token))
    second = await client.post(f"/api/v1/inventory-items/{item_id}/barcode", headers=_auth(worker_token))
    assert first.json()["data"]["attributes"]["barcode"] == second.json()["data"]["attributes"]["barcode"]


async def test_generate_barcode_unknown_item_is_404(client, worker_token, seed):
    resp = await client.post("/api/v1/inventory-items/nope/barcode", headers=_auth(worker_token))
    assert resp.status_code == 404
