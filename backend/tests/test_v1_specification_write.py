"""Recipe card writes — /admin/specifications/{id} (admin-map.md §2.3.2).

Covers: create («Новый рецепт»), PATCH of the left-column fields + the
public/archive toggles, variant create/duplicate/delete (last variant is
protected), composition PUT (item validation + computed total), per-store
price PUT (including the `priceValue: null` «по цене состава» case), and
auth on every mutating endpoint.
"""

import pytest_asyncio

from app.catalog_models import Category, Store
from app.dictionary_models import RecipeTag
from app.inventory_models import Item
from app.staff_models import Worker
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed(client):
    async with TestingSessionLocal() as db:
        category = Category(title="Розы", group_id="9")
        author = Worker(name="Флорист Аня", login="anya", status="active")
        tag = RecipeTag(title="Хит продаж")
        store_a = Store(title="Точка на Невском")
        store_b = Store(title="Точка на Литейном")
        rose = Item(title="Роза Кения 40 см", min_price=150, max_price=200)
        greenery = Item(title="Зелень эвкалипт", min_price=50, max_price=80)
        db.add_all([category, author, tag, store_a, store_b, rose, greenery])
        await db.commit()
        return {
            "category_id": category.id,
            "author_id": author.id,
            "tag_id": tag.id,
            "store_a_id": store_a.id,
            "store_b_id": store_b.id,
            "rose_id": rose.id,
            "greenery_id": greenery.id,
        }


async def _create_spec(client, token, seed, **overrides):
    attrs = {"title": "Букет «Рассвет»", "description": "Нежный букет", **overrides}
    resp = await client.post(
        "/api/v1/specifications",
        json={
            "data": {
                "type": "specifications",
                "attributes": attrs,
                "relationships": {
                    "category": {"data": {"type": "categories", "id": seed["category_id"]}},
                    "author": {"data": {"type": "workers", "id": seed["author_id"]}},
                },
            }
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- create ----------


async def test_create_specification_seeds_one_variant(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec = doc["data"]
    assert spec["attributes"]["title"] == "Букет «Рассвет»"
    assert spec["relationships"]["category"]["data"]["id"] == seed["category_id"]
    assert spec["relationships"]["author"]["data"]["id"] == seed["author_id"]

    swv_ids = [r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"]
    assert len(swv_ids) == 1


async def test_create_specification_requires_title(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/specifications",
        json={"data": {"attributes": {"title": "   "}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_specification_requires_auth(client, seed):
    resp = await client.post(
        "/api/v1/specifications", json={"data": {"attributes": {"title": "X"}}}
    )
    assert resp.status_code == 401


async def test_create_specification_rejects_unknown_category(client, worker_token, seed):
    resp = await client.post(
        "/api/v1/specifications",
        json={
            "data": {
                "attributes": {"title": "Букет"},
                "relationships": {"category": {"data": {"type": "categories", "id": "nope"}}},
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


# ---------- PATCH ----------


async def test_patch_updates_fields(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]

    resp = await client.patch(
        f"/api/v1/specifications/{spec_id}",
        json={"data": {"attributes": {
            "title": "Букет «Закат»",
            "videoUrl": "https://youtube.com/watch?v=abc",
            "tags": [seed["tag_id"]],
        }}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["data"]["attributes"]["title"] == "Букет «Закат»"
    assert body["data"]["attributes"]["videoUrl"] == "https://youtube.com/watch?v=abc"
    assert body["data"]["relationships"]["recipeTags"]["data"] == [
        {"type": "recipe-tags", "id": seed["tag_id"]}
    ]


async def test_patch_public_toggle(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    assert doc["data"]["attributes"]["public"] is False

    resp = await client.patch(
        f"/api/v1/specifications/{spec_id}",
        json={"data": {"attributes": {"public": True}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["attributes"]["public"] is True


async def test_patch_archive_toggle(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]

    resp = await client.patch(
        f"/api/v1/specifications/{spec_id}",
        json={"data": {"attributes": {"status": "off"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["attributes"]["status"] == "off"

    # The «Архив рецептов» tab reads filter[status]=off.
    listing = await client.get(
        "/api/v1/specifications?filter[status]=off", headers=_auth(worker_token)
    )
    assert spec_id in [r["id"] for r in listing.json()["data"]]


async def test_patch_rejects_blank_title(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    resp = await client.patch(
        f"/api/v1/specifications/{spec_id}",
        json={"data": {"attributes": {"title": "  "}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_patch_requires_auth(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    resp = await client.patch(
        f"/api/v1/specifications/{spec_id}", json={"data": {"attributes": {"title": "X"}}}
    )
    assert resp.status_code == 401


# ---------- variants ----------


async def test_add_and_delete_variant(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]

    resp = await client.post(
        f"/api/v1/specifications/{spec_id}/variants",
        json={"title": "19 штук"},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    swvs = [r for r in resp.json()["included"] if r["type"] == "specification-with-variants"]
    assert len(swvs) == 2
    new_swv_id = next(
        s["id"] for s in swvs
        if any(
            v["id"] == s["relationships"]["variant"]["data"]["id"] and v["attributes"]["title"] == "19 штук"
            for v in resp.json()["included"] if v["type"] == "specification-variants"
        )
    )

    delete_resp = await client.delete(
        f"/api/v1/specification-variants/{new_swv_id}", headers=_auth(worker_token)
    )
    assert delete_resp.status_code == 200
    remaining = [
        r for r in delete_resp.json()["included"] if r["type"] == "specification-with-variants"
    ]
    assert len(remaining) == 1


async def test_cannot_delete_last_variant(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.delete(
        f"/api/v1/specification-variants/{swv_id}", headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_duplicate_variant_copies_composition_and_prices(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )

    await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition",
        json={"data": [{"itemId": seed["rose_id"], "quantity": 5}]},
        headers=_auth(worker_token),
    )
    await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [{"storeId": seed["store_a_id"], "priceValue": 1500}]},
        headers=_auth(worker_token),
    )

    dup_resp = await client.post(
        f"/api/v1/specifications/{spec_id}/variants",
        json={"copyFrom": swv_id},
        headers=_auth(worker_token),
    )
    assert dup_resp.status_code == 201, dup_resp.text
    body = dup_resp.json()
    swvs = [r for r in body["included"] if r["type"] == "specification-with-variants"]
    assert len(swvs) == 2
    dup_swv = next(s for s in swvs if s["id"] != swv_id)
    assert dup_swv["attributes"]["compositionTotal"] == 1000.0  # 5 x 200

    dup_prices = [
        r for r in body["included"]
        if r["type"] == "specification-variant-prices"
        and r["relationships"]["specVariants"]["data"]["id"] == dup_swv["id"]
    ]
    assert len(dup_prices) == 1
    assert dup_prices[0]["attributes"]["priceValue"] == 1500


async def test_rename_variant(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.patch(
        f"/api/v1/specification-variants/{swv_id}",
        json={"data": {"attributes": {"title": "25 штук"}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    variants = [r for r in resp.json()["included"] if r["type"] == "specification-variants"]
    assert any(v["attributes"]["title"] == "25 штук" for v in variants)


async def test_variant_writes_require_auth(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    assert (await client.post(f"/api/v1/specifications/{spec_id}/variants", json={"title": "X"})).status_code == 401
    assert (await client.patch(f"/api/v1/specification-variants/{swv_id}", json={})).status_code == 401
    assert (await client.delete(f"/api/v1/specification-variants/{swv_id}")).status_code == 401


# ---------- composition ----------


async def test_composition_put_computes_total(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )

    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition",
        json={"data": [
            {"itemId": seed["rose_id"], "quantity": 9},
            {"itemId": seed["greenery_id"], "quantity": 3},
        ]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    swv = next(
        r for r in resp.json()["included"]
        if r["type"] == "specification-with-variants" and r["id"] == swv_id
    )
    # 9 x 200 + 3 x 80 = 2040
    assert swv["attributes"]["compositionTotal"] == 2040.0

    comp_rows = [r for r in resp.json()["included"] if r["type"] == "specification-compositions"]
    assert len(comp_rows) == 2


async def test_composition_put_rejects_unknown_item(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition",
        json={"data": [{"itemId": "does-not-exist", "quantity": 1}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_composition_put_rejects_non_positive_quantity(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition",
        json={"data": [{"itemId": seed["rose_id"], "quantity": 0}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_composition_put_requires_auth(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition", json={"data": []}
    )
    assert resp.status_code == 401


# ---------- store prices ----------


async def test_store_prices_roundtrip_and_null_means_composition_price(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    await client.put(
        f"/api/v1/specification-variants/{swv_id}/composition",
        json={"data": [{"itemId": seed["rose_id"], "quantity": 2}]},  # 2 x 200 = 400
        headers=_auth(worker_token),
    )

    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [
            {"storeId": seed["store_a_id"], "priceValue": 999},
            {"storeId": seed["store_b_id"], "priceValue": None},
        ]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    prices = [r for r in resp.json()["included"] if r["type"] == "specification-variant-prices"]
    by_store = {p["relationships"]["store"]["data"]["id"]: p for p in prices}

    a = by_store[seed["store_a_id"]]
    assert a["attributes"]["priceValue"] == 999
    assert a["attributes"]["effectivePrice"] == 999
    assert a["attributes"]["isDefaultPrice"] is False

    b = by_store[seed["store_b_id"]]
    assert b["attributes"]["priceValue"] is None
    assert b["attributes"]["effectivePrice"] == 400.0
    assert b["attributes"]["isDefaultPrice"] is True


async def test_store_prices_put_replaces_full_set(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [{"storeId": seed["store_a_id"], "priceValue": 500}]},
        headers=_auth(worker_token),
    )
    # Second call omits store_a — it should be "removed from the point" (corzinka).
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [{"storeId": seed["store_b_id"], "priceValue": 700}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    prices = [r for r in resp.json()["included"] if r["type"] == "specification-variant-prices"]
    store_ids = {p["relationships"]["store"]["data"]["id"] for p in prices}
    assert store_ids == {seed["store_b_id"]}


async def test_store_prices_put_rejects_unknown_store(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [{"storeId": "nope", "priceValue": 100}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_store_prices_put_rejects_negative_price(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices",
        json={"data": [{"storeId": seed["store_a_id"], "priceValue": -5}]},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_store_prices_put_requires_auth(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    swv_id = next(
        r["id"] for r in doc["included"] if r["type"] == "specification-with-variants"
    )
    resp = await client.put(
        f"/api/v1/specification-variants/{swv_id}/store-prices", json={"data": []}
    )
    assert resp.status_code == 401


# ---------- gallery (URL-based) ----------


async def test_add_and_remove_gallery_image(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]

    add_resp = await client.post(
        f"/api/v1/specifications/{spec_id}/images",
        json={"url": "https://cdn.example.com/rose.jpg"},
        headers=_auth(worker_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    body = add_resp.json()
    assert body["data"]["relationships"]["logo"]["data"] is not None
    image_ids = [r["id"] for r in body["included"] if r["type"] == "images"]
    assert len(image_ids) == 1

    del_resp = await client.delete(
        f"/api/v1/specifications/{spec_id}/images/{image_ids[0]}",
        headers=_auth(worker_token),
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["relationships"]["logo"]["data"] is None


async def test_add_gallery_image_requires_url(client, worker_token, seed):
    doc = await _create_spec(client, worker_token, seed)
    spec_id = doc["data"]["id"]
    resp = await client.post(
        f"/api/v1/specifications/{spec_id}/images",
        json={"url": ""},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
