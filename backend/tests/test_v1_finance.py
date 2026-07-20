"""Учёт и финансы → Отчёты / Финансовый учёт / история выгрузок
(admin-map.md §2.4.5-2.4.8, backend/app/routers/v1_finance.py).

- Расходы: CRUD + validation (fixed article dictionary, amount > 0, store
  must exist).
- P&L: arithmetic on a small seeded scenario — one paid order with a priced
  order_item backed by a StockBalance.cost_price, one expense, one posted
  write-off — checked against `revenue/costOfGoods/grossProfit/expensesTotal/
  writeoffsTotal/netProfit` by hand.
- Reports: all five CSV types generate a non-empty body with the right
  header, refresh regenerates, download serves text/csv.
- Everything requires auth (401).
"""

from datetime import date, datetime

import pytest_asyncio
from sqlalchemy import select

from app.catalog_models import Store
from app.inventory_models import Item, Warehouse, StockBalance, WriteoffInvoice, WriteoffInvoiceItem
from app.models import Order, OrderItem, Payment
from app.finance_models import Expense
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _expense_body(**attrs):
    defaults = {"article": "Аренда", "amount": 15000, "date": "2026-07-05", "comment": "Июль"}
    defaults.update(attrs)
    return {"data": {"type": "expenses", "attributes": defaults}}


@pytest_asyncio.fixture
async def store(client):
    async with TestingSessionLocal() as db:
        row = Store(title="Точка 1")
        db.add(row)
        await db.commit()
        return row.id


# ==========================================================================
# expenses: auth + CRUD + validation
# ==========================================================================


async def test_expense_writes_require_auth(client):
    assert (await client.get("/api/v1/expenses")).status_code == 401
    assert (await client.post("/api/v1/expenses", json=_expense_body())).status_code == 401
    assert (await client.delete("/api/v1/expenses/x")).status_code == 401


async def test_create_and_list_expense(client, worker_token, store):
    resp = await client.post(
        "/api/v1/expenses",
        json=_expense_body(storeId=store),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    a = resp.json()["data"]["attributes"]
    assert a["article"] == "Аренда"
    assert a["amount"] == 15000
    assert a["date"] == "2026-07-05"
    assert a["comment"] == "Июль"

    listing = await client.get("/api/v1/expenses", headers=_auth(worker_token))
    assert listing.status_code == 200
    body = listing.json()
    assert len(body["data"]) == 1
    assert body["meta"]["total"] == 15000


async def test_create_expense_rejects_unknown_article(client, worker_token, store):
    resp = await client.post(
        "/api/v1/expenses",
        json=_expense_body(storeId=store, article="Не в списке"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_create_expense_rejects_non_positive_amount(client, worker_token, store):
    resp = await client.post(
        "/api/v1/expenses",
        json=_expense_body(storeId=store, amount=0),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400

    resp2 = await client.post(
        "/api/v1/expenses",
        json=_expense_body(storeId=store, amount=-500),
        headers=_auth(worker_token),
    )
    assert resp2.status_code == 400


async def test_create_expense_requires_existing_store(client, worker_token):
    resp = await client.post(
        "/api/v1/expenses",
        json=_expense_body(storeId="does-not-exist"),
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_expense_filters_by_period_store_and_search(client, worker_token, store):
    async with TestingSessionLocal() as db:
        other_store = Store(title="Точка 2")
        db.add(other_store)
        await db.flush()
        db.add_all([
            Expense(article="Аренда", amount=1000, date=date(2026, 7, 1), store_id=store),
            Expense(article="Интернет", amount=2000, date=date(2026, 6, 1), store_id=store, comment="за июнь"),
            Expense(article="Курьер", amount=500, date=date(2026, 7, 2), store_id=other_store.id),
        ])
        await db.commit()

    resp = await client.get(
        "/api/v1/expenses",
        params={"from": "2026-07-01", "to": "2026-07-31", "store": store},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200
    articles = [r["attributes"]["article"] for r in resp.json()["data"]]
    assert articles == ["Аренда"]

    resp2 = await client.get("/api/v1/expenses", params={"q": "июнь"}, headers=_auth(worker_token))
    assert [r["attributes"]["article"] for r in resp2.json()["data"]] == ["Интернет"]


async def test_delete_expense(client, worker_token, store):
    async with TestingSessionLocal() as db:
        row = Expense(article="Прочее", amount=100, date=date(2026, 7, 1), store_id=store)
        db.add(row)
        await db.commit()
        expense_id = row.id

    resp = await client.delete(f"/api/v1/expenses/{expense_id}", headers=_auth(worker_token))
    assert resp.status_code == 204

    async with TestingSessionLocal() as db:
        assert (await db.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none() is None


# ==========================================================================
# P&L
# ==========================================================================


@pytest_asyncio.fixture
async def pnl_seed(client, store):
    """One order shipped in July with a priced `item` line whose inventory
    item has a known StockBalance.cost_price (covered), plus one *uncovered*
    line (inventory item with no StockBalance row at all) — so the test can
    assert coveredItems/totalItems honestly reflects the gap. Also seeds one
    expense and one posted write-off in the same period."""
    async with TestingSessionLocal() as db:
        wh = Warehouse(title="Склад 1", store_id=store)
        rose = Item(title="Роза Кения", max_price=200)
        ribbon = Item(title="Лента", max_price=50)  # no StockBalance row
        db.add_all([wh, rose, ribbon])
        await db.flush()

        db.add(StockBalance(warehouse_id=wh.id, item_id=rose.id, quantity=100, cost_price=120))
        await db.flush()

        order = Order(
            customer_name="Клиент", phone="+79990000000", address="", status="completed",
            payment_status="paid", bouquet_ids="[]", total_amount=1000, store_id=store,
            created_at=datetime(2026, 7, 10, 12, 0, 0),
        )
        db.add(order)
        await db.flush()

        db.add_all([
            OrderItem(order_id=order.id, kind="item", inventory_item_id=rose.id,
                      title="Роза Кения", unit_price=200, quantity=5),
            OrderItem(order_id=order.id, kind="item", inventory_item_id=ribbon.id,
                      title="Лента", unit_price=50, quantity=2),
        ])
        db.add(Payment(
            order_id=order.id, tbank_order_id="manual-1", amount=1000, status="CONFIRMED",
            created_at=datetime(2026, 7, 10, 12, 5, 0),
        ))
        db.add(Expense(article="Аренда", amount=3000, date=date(2026, 7, 5), store_id=store))

        wo = WriteoffInvoice(store_id=store, date=date(2026, 7, 12), status="posted", total_amount=250)
        db.add(wo)
        await db.flush()
        db.add(WriteoffInvoiceItem(invoice_id=wo.id, item_id=rose.id, quantity=1, cost_price=250))

        # A draft (not posted) write-off in the same period must NOT count.
        draft_wo = WriteoffInvoice(store_id=store, date=date(2026, 7, 13), status="draft", total_amount=999)
        db.add(draft_wo)

        await db.commit()
        return order.id


async def test_pnl_requires_auth(client):
    assert (await client.get("/api/v1/finance/pnl")).status_code == 401


async def test_pnl_arithmetic(client, worker_token, store, pnl_seed):
    resp = await client.get(
        "/api/v1/finance/pnl",
        params={"from": "2026-07-01", "to": "2026-07-31", "store": store},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # revenue: the one CONFIRMED payment.
    assert body["revenue"] == 1000.0
    # costOfGoods: only the rose line is covered (5 * 120 = 600); the ribbon
    # line has no StockBalance row so it contributes 0 and is uncovered.
    assert body["costOfGoods"] == 600.0
    assert body["coveredItems"] == 1
    assert body["totalItems"] == 2
    # grossProfit = revenue - costOfGoods
    assert body["grossProfit"] == 400.0
    assert body["expensesTotal"] == 3000.0
    # writeoffsTotal: only the *posted* write-off (250) counts, not the draft.
    assert body["writeoffsTotal"] == 250.0
    # netProfit = grossProfit - expensesTotal - writeoffsTotal
    assert body["netProfit"] == 400.0 - 3000.0 - 250.0


# ==========================================================================
# reports
# ==========================================================================

REPORT_HEADERS = {
    "payments": "Дата;Заказ;Способ;Статус;Сумма",
    "sales": "Дата;Заказ;Клиент;Статус;Сумма;Скидка;Надбавка",
    "vendors": "Поставщик;Накладных;Сумма закупок за период",
    "goods-flow": "Товар;Категория;Приход, шт;Приход, ₽;Списание, шт;Списание, ₽;Продано, шт;Продано, ₽",
    "bouquets": "Букет;Продано раз;Выручка",
}


async def test_report_writes_require_auth(client):
    assert (await client.get("/api/v1/reports")).status_code == 401
    assert (await client.post("/api/v1/reports", json={"type": "sales"})).status_code == 401
    assert (await client.post("/api/v1/reports/x/refresh")).status_code == 401
    assert (await client.get("/api/v1/reports/x/download")).status_code == 401


async def test_generate_each_report_type(client, worker_token, pnl_seed):
    for report_type, header in REPORT_HEADERS.items():
        resp = await client.post(
            "/api/v1/reports",
            json={"data": {"type": "generated-files", "attributes": {
                "type": report_type, "from": "2026-07-01", "to": "2026-07-31",
            }}},
            headers=_auth(worker_token),
        )
        assert resp.status_code == 201, f"{report_type}: {resp.text}"
        a = resp.json()["data"]["attributes"]
        assert a["kind"] == f"report:{report_type}"
        assert a["status"] == "done"


async def test_report_invalid_type_is_400(client, worker_token):
    resp = await client.post(
        "/api/v1/reports",
        json={"data": {"type": "generated-files", "attributes": {
            "type": "not-a-type", "from": "2026-07-01", "to": "2026-07-31",
        }}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400


async def test_report_list_refresh_download(client, worker_token, pnl_seed):
    create = await client.post(
        "/api/v1/reports",
        json={"data": {"type": "generated-files", "attributes": {
            "type": "sales", "from": "2026-07-01", "to": "2026-07-31",
        }}},
        headers=_auth(worker_token),
    )
    report_id = create.json()["data"]["id"]

    listing = await client.get("/api/v1/reports", params={"type": "sales"}, headers=_auth(worker_token))
    assert listing.status_code == 200
    assert any(r["id"] == report_id for r in listing.json()["data"])

    refreshed = await client.post(f"/api/v1/reports/{report_id}/refresh", headers=_auth(worker_token))
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["data"]["attributes"]["status"] == "done"

    downloaded = await client.get(f"/api/v1/reports/{report_id}/download", headers=_auth(worker_token))
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("text/csv")
    assert "attachment" in downloaded.headers["content-disposition"]
    text = downloaded.content.decode("utf-8-sig")
    header_line = text.splitlines()[0]
    assert header_line == REPORT_HEADERS["sales"]
    # The order shipped in the seeded period must show up as a data row.
    assert len(text.splitlines()) >= 2


async def test_download_missing_report_is_404(client, worker_token):
    resp = await client.get("/api/v1/reports/does-not-exist/download", headers=_auth(worker_token))
    assert resp.status_code == 404


# ==========================================================================
# generated-files (shared export history)
# ==========================================================================


async def test_generated_files_writes_require_auth(client):
    assert (await client.get("/api/v1/generated-files")).status_code == 401
    assert (await client.post("/api/v1/generated-files", json={})).status_code == 401


async def test_create_and_filter_generated_file(client, worker_token):
    resp = await client.post(
        "/api/v1/generated-files",
        json={"data": {"type": "generated-files", "attributes": {
            "kind": "items-export", "title": "Экспорт товаров", "content": "a;b\r\n1;2\r\n",
        }}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["attributes"]["kind"] == "items-export"

    listing = await client.get(
        "/api/v1/generated-files", params={"kind": "items-export"}, headers=_auth(worker_token)
    )
    kinds = {r["attributes"]["kind"] for r in listing.json()["data"]}
    assert kinds == {"items-export"}


async def test_download_generated_file(client, worker_token):
    create = await client.post(
        "/api/v1/generated-files",
        json={"data": {"type": "generated-files", "attributes": {
            "kind": "customers-export", "title": "Экспорт клиентов", "content": "a;b\r\n1;2\r\n",
        }}},
        headers=_auth(worker_token),
    )
    file_id = create.json()["data"]["id"]

    resp = await client.get(f"/api/v1/generated-files/{file_id}/download", headers=_auth(worker_token))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.content.decode("utf-8-sig").startswith("a;b")

    assert (await client.get(f"/api/v1/generated-files/{file_id}/download")).status_code == 401
    assert (
        await client.get("/api/v1/generated-files/missing/download", headers=_auth(worker_token))
    ).status_code == 404


async def test_create_generated_file_rejects_unknown_kind(client, worker_token):
    resp = await client.post(
        "/api/v1/generated-files",
        json={"data": {"type": "generated-files", "attributes": {
            "kind": "not-a-kind", "title": "X", "content": "",
        }}},
        headers=_auth(worker_token),
    )
    assert resp.status_code == 400
