"""Settings dictionaries write operations (admin-map §2.7).

Generic POST /v1/<dict> + DELETE /v1/<dict>/{id} across all nine reference
dictionaries, PATCH for the two richer ones (customer-celebrations, measures),
and the singleton personal-data template (GET/PUT + ИНН validation).
"""

import pytest

from app.dictionary_models import PersonalDataTemplate
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _body(title, **attrs):
    return {"data": {"attributes": {"title": title, **attrs}}}


ALL_DICTS = [
    "order-tags",
    "recipe-tags",
    "discount-reasons",
    "cash-reasons",
    "customer-preferences",
    "customer-sources",
    "order-sources",
    "customer-celebrations",
    "measures",
]


# ---------- generic create / delete ----------


@pytest.mark.parametrize("path", ALL_DICTS)
async def test_create_and_list_roundtrip(client, worker_token, path):
    resp = await client.post(
        f"/api/v1/{path}", json=_body("Моно"), headers=_auth(worker_token)
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()["data"]
    assert created["type"] == path
    assert created["attributes"]["title"] == "Моно"

    listing = await client.get(f"/api/v1/{path}", headers=_auth(worker_token))
    titles = [r["attributes"]["title"] for r in listing.json()["data"]]
    assert "Моно" in titles


@pytest.mark.parametrize("path", ALL_DICTS)
async def test_write_requires_auth(client, path):
    post = await client.post(f"/api/v1/{path}", json=_body("Тег"))
    assert post.status_code == 401
    delete = await client.delete(f"/api/v1/{path}/some-id")
    assert delete.status_code == 401


async def test_create_empty_title_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/order-tags", json=_body("   "), headers=_auth(worker_token)
    )
    assert resp.status_code == 400


async def test_create_title_over_50_chars_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/order-tags", json=_body("х" * 51), headers=_auth(worker_token)
    )
    assert resp.status_code == 400
    assert "50" in resp.json()["detail"]

    ok = await client.post(
        "/api/v1/order-tags", json=_body("х" * 50), headers=_auth(worker_token)
    )
    assert ok.status_code == 201


async def test_create_duplicate_title_is_400(client, worker_token):
    first = await client.post(
        "/api/v1/order-tags", json=_body("WOW эффект"), headers=_auth(worker_token)
    )
    assert first.status_code == 201
    dup = await client.post(
        "/api/v1/order-tags", json=_body("WOW эффект"), headers=_auth(worker_token)
    )
    assert dup.status_code == 400


async def test_same_title_allowed_across_dictionaries(client, worker_token):
    """Uniqueness is per dictionary, not global."""
    a = await client.post(
        "/api/v1/order-tags", json=_body("Нежный"), headers=_auth(worker_token)
    )
    b = await client.post(
        "/api/v1/recipe-tags", json=_body("Нежный"), headers=_auth(worker_token)
    )
    assert a.status_code == 201 and b.status_code == 201


async def test_delete_removes_row(client, worker_token):
    created = await client.post(
        "/api/v1/order-tags", json=_body("Временный"), headers=_auth(worker_token)
    )
    tag_id = created.json()["data"]["id"]

    resp = await client.delete(
        f"/api/v1/order-tags/{tag_id}", headers=_auth(worker_token)
    )
    assert resp.status_code == 204

    listing = await client.get("/api/v1/order-tags", headers=_auth(worker_token))
    assert tag_id not in [r["id"] for r in listing.json()["data"]]


async def test_delete_missing_id_is_404(client, worker_token):
    resp = await client.delete(
        "/api/v1/order-tags/does-not-exist", headers=_auth(worker_token)
    )
    assert resp.status_code == 404


async def test_delete_id_from_other_dictionary_is_404(client, worker_token):
    """An id that exists in another dictionary must not delete anything here."""
    created = await client.post(
        "/api/v1/recipe-tags", json=_body("Чужой"), headers=_auth(worker_token)
    )
    foreign_id = created.json()["data"]["id"]

    resp = await client.delete(
        f"/api/v1/order-tags/{foreign_id}", headers=_auth(worker_token)
    )
    assert resp.status_code == 404


async def test_simple_dictionaries_have_no_patch(client, worker_token):
    """Chip lists are add/remove only — PATCH must not exist (405)."""
    created = await client.post(
        "/api/v1/order-tags", json=_body("Большой"), headers=_auth(worker_token)
    )
    tag_id = created.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/order-tags/{tag_id}",
        json=_body("Маленький"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 405


# ---------- customer-celebrations (period) ----------


async def test_celebration_create_with_period(client, worker_token):
    resp = await client.post(
        "/api/v1/customer-celebrations",
        json=_body("8 марта", dateFrom="2026-03-07", dateTo="2026-03-09"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["dateFrom"] == "2026-03-07"
    assert a["dateTo"] == "2026-03-09"


async def test_celebration_bad_date_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/customer-celebrations",
        json=_body("Новый год", dateFrom="31.12.2026"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_celebration_patch_updates_period_and_title(client, worker_token):
    created = await client.post(
        "/api/v1/customer-celebrations",
        json=_body("День матери", dateFrom="2026-11-29", dateTo="2026-11-29"),
        headers=_auth(worker_token),
    )
    cel_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/customer-celebrations/{cel_id}",
        json=_body("День матери 2026", dateFrom="2026-11-28", dateTo="2026-11-30"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "День матери 2026"
    assert a["dateFrom"] == "2026-11-28"
    assert a["dateTo"] == "2026-11-30"


# ---------- measures (shortName / measureCode) ----------


async def test_measure_create_with_code(client, worker_token):
    resp = await client.post(
        "/api/v1/measures",
        json=_body("Штуки", shortName="шт", measureCode=0),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["shortName"] == "шт"
    assert a["measureCode"] == 0


async def test_measure_non_int_code_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/measures",
        json=_body("Иные", shortName="ин", measureCode="255"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_measure_patch_inline_edit(client, worker_token):
    created = await client.post(
        "/api/v1/measures",
        json=_body("Иные", shortName="ин", measureCode=255),
        headers=_auth(worker_token),
    )
    m_id = created.json()["data"]["id"]

    resp = await client.patch(
        f"/api/v1/measures/{m_id}",
        json=_body("Иные единицы", shortName="ин.", measureCode=254),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["title"] == "Иные единицы"
    assert a["shortName"] == "ин."
    assert a["measureCode"] == 254


async def test_measure_patch_duplicate_title_is_400(client, worker_token):
    await client.post(
        "/api/v1/measures", json=_body("Штуки"), headers=_auth(worker_token)
    )
    other = await client.post(
        "/api/v1/measures", json=_body("Метры"), headers=_auth(worker_token)
    )
    resp = await client.patch(
        f"/api/v1/measures/{other.json()['data']['id']}",
        json=_body("Штуки"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_measure_patch_missing_is_404(client, worker_token):
    resp = await client.patch(
        "/api/v1/measures/nope", json=_body("Штуки"), headers=_auth(worker_token)
    )
    assert resp.status_code == 404


# ---------- personal-data (singleton form) ----------


async def test_personal_data_requires_auth(client):
    assert (await client.get("/api/v1/personal-data")).status_code == 401
    assert (
        await client.put("/api/v1/personal-data", json={"data": {"attributes": {}}})
    ).status_code == 401


async def test_personal_data_get_bootstraps_empty_singleton(client, worker_token):
    resp = await client.get("/api/v1/personal-data", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["id"] == PersonalDataTemplate.SINGLETON_ID
    a = data["attributes"]
    assert a == {
        "ipTitle": None,
        "inn": None,
        "legalAddress": None,
        "website": None,
        "email": None,
    }


async def test_personal_data_put_roundtrip(client, worker_token):
    resp = await client.put(
        "/api/v1/personal-data",
        json={
            "data": {
                "attributes": {
                    "ipTitle": "ИП Сомова А.А.",
                    "inn": "780204893183",
                    "legalAddress": "Санкт-Петербург, Невский пр., 1",
                    "website": "https://floree.ru",
                    "email": "info@floree.ru",
                }
            }
        },
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["ipTitle"] == "ИП Сомова А.А."
    assert a["inn"] == "780204893183"

    # Singleton: a second GET returns the same row, not a new empty one.
    again = await client.get("/api/v1/personal-data", headers=_auth(worker_token))
    assert again.json()["data"]["attributes"]["ipTitle"] == "ИП Сомова А.А."

    async with TestingSessionLocal() as db:
        from sqlalchemy import select, func

        count = (
            await db.execute(select(func.count()).select_from(PersonalDataTemplate))
        ).scalar_one()
        assert count == 1


@pytest.mark.parametrize("bad_inn", ["123", "12345678901", "1234567890123", "12345abcde"])
async def test_personal_data_invalid_inn_is_400(client, worker_token, bad_inn):
    resp = await client.put(
        "/api/v1/personal-data",
        json={"data": {"attributes": {"inn": bad_inn}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400, bad_inn


@pytest.mark.parametrize("good_inn", ["1234567890", "123456789012"])
async def test_personal_data_valid_inn_lengths(client, worker_token, good_inn):
    resp = await client.put(
        "/api/v1/personal-data",
        json={"data": {"attributes": {"inn": good_inn}}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, good_inn
    assert resp.json()["data"]["attributes"]["inn"] == good_inn


async def test_personal_data_partial_put_keeps_other_fields(client, worker_token):
    await client.put(
        "/api/v1/personal-data",
        json={"data": {"attributes": {"ipTitle": "ИП Тест", "inn": "1234567890"}}},
        headers=_auth(worker_token),
    )
    resp = await client.put(
        "/api/v1/personal-data",
        json={"data": {"attributes": {"email": "new@floree.ru"}}},
        headers=_auth(worker_token),
    )
    a = resp.json()["data"]["attributes"]
    assert a["email"] == "new@floree.ru"
    assert a["ipTitle"] == "ИП Тест"
    assert a["inn"] == "1234567890"
