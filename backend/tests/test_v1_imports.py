"""Импорт клиентов и номенклатуры из файла — admin-map §2.5.3 «Импорт
клиентов» / §2.3.7-по-мотивам «Импорт каталога» (v1_imports.py).

Covers:
- preview: auto-guessed column→field mapping from CSV and .xlsx headers,
  fileToken issued for the second step;
- run (customers): phone normalization (same rule as v1_customers), a
  duplicate phone is skipped (not overwritten), a malformed birthday is
  reported as a row error instead of aborting the whole import;
- run (items): category auto-created by title, exact title+barcode dedup;
- guardrails: >10000 data rows -> 400, unknown/expired fileToken -> 400,
  everything requires auth (401).
"""

import io

import openpyxl
import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Category, Customer
from app.inventory_models import Item
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _csv_bytes(text: str) -> bytes:
    return text.encode("utf-8")


CUSTOMERS_CSV = (
    "Имя,Телефон,Дата рождения,Email,Комментарий\n"
    "Анна Смирнова,+7 999 123-45-67,1990-05-12,anna@example.com,VIP\n"
    "Иван Петров,89161234567,1985-11-23,,\n"
)

ITEMS_CSV = (
    "Название,Цена,Штрихкод,Категория\n"
    "Роза красная 60см,150,4600000000001,Розы\n"
    "Лента упаковочная,80,,Упаковка\n"
)


async def _preview(client, token, entity, filename, content, content_type="text/csv"):
    return await client.post(
        f"/api/v1/imports/{entity}/preview",
        headers=_auth(token),
        files={"file": (filename, content, content_type)},
    )


# ---------- auth ----------


async def test_import_endpoints_require_auth(client):
    assert (
        await client.post("/api/v1/imports/customers/preview", files={"file": ("a.csv", b"a,b", "text/csv")})
    ).status_code == 401
    assert (await client.post("/api/v1/imports/customers/run", json={})).status_code == 401
    assert (await client.get("/api/v1/imports/customers/template")).status_code == 401


# ---------- preview ----------


async def test_preview_csv_customers_auto_maps_headers(client, worker_token):
    resp = await _preview(client, worker_token, "customers", "clients.csv", _csv_bytes(CUSTOMERS_CSV))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["columns"] == ["Имя", "Телефон", "Дата рождения", "Email", "Комментарий"]
    assert body["suggestedMapping"] == {"name": 0, "phone": 1, "birthday": 2, "email": 3, "comment": 4}
    assert len(body["rows"]) == 3  # header + 2 data rows, first PREVIEW_ROWS
    assert body["rows"][1][0] == "Анна Смирнова"
    assert body["fileToken"]


async def test_preview_csv_items_auto_maps_headers(client, worker_token):
    resp = await _preview(client, worker_token, "items", "items.csv", _csv_bytes(ITEMS_CSV))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["suggestedMapping"] == {"title": 0, "max_price": 1, "barcode": 2, "category": 3}


async def test_preview_xlsx(client, worker_token):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Имя", "Телефон", "Дата рождения"])
    ws.append(["Анна Смирнова", "+79991234567", "1990-05-12"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    resp = await _preview(
        client, worker_token, "customers", "clients.xlsx", buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["columns"] == ["Имя", "Телефон", "Дата рождения"]
    assert body["rows"][1] == ["Анна Смирнова", "+79991234567", "1990-05-12"]
    assert body["suggestedMapping"]["name"] == 0
    assert body["suggestedMapping"]["phone"] == 1
    assert body["suggestedMapping"]["birthday"] == 2


async def test_preview_rejects_empty_file(client, worker_token):
    resp = await _preview(client, worker_token, "customers", "empty.csv", b"")
    assert resp.status_code == 400


# ---------- run: customers ----------


async def _run(client, token, entity, file_token, mapping, skip_first_row=True):
    return await client.post(
        f"/api/v1/imports/{entity}/run",
        headers=_auth(token),
        json={"fileToken": file_token, "mapping": mapping, "skipFirstRow": skip_first_row},
    )


async def test_run_customers_creates_and_normalizes_phone(client, worker_token):
    preview = await _preview(client, worker_token, "customers", "clients.csv", _csv_bytes(CUSTOMERS_CSV))
    file_token = preview.json()["fileToken"]
    mapping = preview.json()["suggestedMapping"]

    resp = await _run(client, worker_token, "customers", file_token, mapping)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result == {"created": 2, "skipped": 0, "errors": []}

    async with TestingSessionLocal() as db:
        rows = (await db.execute(select(Customer))).scalars().all()
        by_name = {c.name: c for c in rows}
        assert by_name["Анна Смирнова"].phone == "+79991234567"
        assert by_name["Анна Смирнова"].birthday.isoformat() == "1990-05-12"
        assert by_name["Иван Петров"].phone == "+79161234567"


async def test_run_customers_duplicate_phone_is_skipped_not_overwritten(client, worker_token):
    async with TestingSessionLocal() as db:
        db.add(Customer(name="Существующий клиент", phone="+79991234567"))
        await db.commit()

    preview = await _preview(client, worker_token, "customers", "clients.csv", _csv_bytes(CUSTOMERS_CSV))
    file_token = preview.json()["fileToken"]
    mapping = preview.json()["suggestedMapping"]

    resp = await _run(client, worker_token, "customers", file_token, mapping)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["created"] == 1  # only Иван Петров is new
    assert result["skipped"] == 1

    async with TestingSessionLocal() as db:
        existing = (
            await db.execute(select(Customer).where(Customer.phone == "+79991234567"))
        ).scalar_one()
        # untouched — not overwritten by the imported row's name
        assert existing.name == "Существующий клиент"


async def test_run_customers_bad_date_reported_as_row_error(client, worker_token):
    csv_text = (
        "Имя,Телефон,Дата рождения\n"
        "Хорошая Строка,+79991234567,1990-05-12\n"
        "Плохая Дата,+79161234567,не дата\n"
    )
    preview = await _preview(client, worker_token, "customers", "clients.csv", _csv_bytes(csv_text))
    file_token = preview.json()["fileToken"]
    mapping = {"name": 0, "phone": 1, "birthday": 2}

    resp = await _run(client, worker_token, "customers", file_token, mapping)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["created"] == 1
    assert result["errors"] == [{"row": 3, "message": "дата рождения должна быть в формате ГГГГ-ММ-ДД"}]


async def test_run_customers_requires_phone_mapping(client, worker_token):
    preview = await _preview(client, worker_token, "customers", "clients.csv", _csv_bytes(CUSTOMERS_CSV))
    file_token = preview.json()["fileToken"]

    resp = await _run(client, worker_token, "customers", file_token, {"name": 0})
    assert resp.status_code == 400


# ---------- run: items ----------


async def test_run_items_creates_with_auto_category(client, worker_token):
    preview = await _preview(client, worker_token, "items", "items.csv", _csv_bytes(ITEMS_CSV))
    file_token = preview.json()["fileToken"]
    mapping = preview.json()["suggestedMapping"]

    resp = await _run(client, worker_token, "items", file_token, mapping)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result == {"created": 2, "skipped": 0, "errors": []}

    async with TestingSessionLocal() as db:
        items = (await db.execute(select(Item))).scalars().all()
        by_title = {i.title: i for i in items}
        rose = by_title["Роза красная 60см"]
        assert rose.max_price == 150
        assert rose.min_price == 150
        assert rose.barcode == "4600000000001"

        categories = (await db.execute(select(Category))).scalars().all()
        titles = {c.title for c in categories}
        assert titles == {"Розы", "Упаковка"}
        assert rose.category_id == next(c.id for c in categories if c.title == "Розы")


async def test_run_items_exact_title_barcode_duplicate_is_skipped(client, worker_token):
    async with TestingSessionLocal() as db:
        db.add(Item(title="Роза красная 60см", barcode="4600000000001", min_price=100, max_price=100))
        await db.commit()

    preview = await _preview(client, worker_token, "items", "items.csv", _csv_bytes(ITEMS_CSV))
    file_token = preview.json()["fileToken"]
    mapping = preview.json()["suggestedMapping"]

    resp = await _run(client, worker_token, "items", file_token, mapping)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["created"] == 1  # only «Лента упаковочная» is new
    assert result["skipped"] == 1

    async with TestingSessionLocal() as db:
        rows = (
            await db.execute(select(Item).where(Item.title == "Роза красная 60см"))
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].max_price == 100  # untouched, not overwritten


# ---------- guardrails ----------


async def test_run_rejects_too_many_rows(client, worker_token):
    header = "Имя,Телефон\n"
    body = "".join(f"Клиент {i},7999000{i:04d}\n" for i in range(10001))
    preview = await _preview(client, worker_token, "customers", "big.csv", _csv_bytes(header + body))
    file_token = preview.json()["fileToken"]

    resp = await _run(client, worker_token, "customers", file_token, {"name": 0, "phone": 1})
    assert resp.status_code == 400
    assert "10000" in resp.json()["detail"]


async def test_run_rejects_unknown_file_token(client, worker_token):
    resp = await _run(client, worker_token, "customers", "not-a-real-token", {"phone": 1})
    assert resp.status_code == 400


# ---------- template ----------


async def test_template_downloads_csv(client, worker_token):
    resp = await client.get("/api/v1/imports/customers/template", headers=_auth(worker_token))
    assert resp.status_code == 200
    assert "customers-example.csv" in resp.headers["content-disposition"]
    assert resp.headers["content-type"].startswith("text/csv")

    resp = await client.get("/api/v1/imports/items/template", headers=_auth(worker_token))
    assert resp.status_code == 200
    assert "items-example.csv" in resp.headers["content-disposition"]


async def test_unknown_entity_is_404(client, worker_token):
    resp = await client.get("/api/v1/imports/bogus/template", headers=_auth(worker_token))
    assert resp.status_code == 404
