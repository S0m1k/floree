"""Admin dashboard analytics — GET /v1/analytics/{money,customers,bouquets,warehouse}
(docs/posiflora/admin-map.md §2.1, /admin/retail-stores).

Covers: auth guard on all four routes, and aggregate correctness against
hand-built fixtures for each tab — revenue/discount/receipt counts (money),
segmentation + bonus-system totals (customers), bouquet revenue/weekday/price
ranking including the legacy bouquet_ids fallback (bouquets), and
category/reason grouping + stock-value totals (warehouse).
"""

import json
from datetime import datetime, timedelta

import pytest_asyncio

from app.catalog_models import Customer, CustomerBonusHistory, Category
from app.inventory_models import (
    Item,
    Warehouse,
    StockBalance,
    PackingInvoice,
    PackingInvoiceItem,
    WriteoffInvoice,
    WriteoffInvoiceItem,
    InventoryAct,
)
from app.loyalty_models import CustomerEvent
from app.models import Order, OrderItem, Payment
from app.catalog_models import Store
from tests.conftest import TestingSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _period_qs(d_from: str, d_to: str) -> str:
    return f"?from={d_from}&to={d_to}"


async def _seed_order(**kwargs) -> str:
    defaults = dict(
        customer_name="", phone="", address="",
        status="completed", payment_status="paid",
        bouquet_ids="[]", total_amount=0, discount_total=0,
    )
    defaults.update(kwargs)
    async with TestingSessionLocal() as db:
        order = Order(**defaults)
        db.add(order)
        await db.commit()
        return order.id


# ---------- auth ----------

async def test_analytics_routes_require_auth(client):
    for path in ("money", "customers", "bouquets", "warehouse"):
        resp = await client.get(f"/api/v1/analytics/{path}")
        assert resp.status_code == 401, path


# ═══════════════════════════════ Деньги ═══════════════════════════════

async def test_money_dashboard_smoke_empty(client, worker_token):
    resp = await client.get("/api/v1/analytics/money", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ordersCount"] == 0
    assert body["grossProfit"] is None
    assert body["dailySeries"]["margin"] == []


async def test_money_dashboard_revenue_discount_and_receipts(client, worker_token):
    day = "2024-03-15"
    ts = datetime(2024, 3, 15, 10, 0, 0)
    o1 = await _seed_order(total_amount=1000, discount_total=100, created_at=ts, closed_at=ts)
    o2 = await _seed_order(total_amount=2000, discount_total=0, created_at=ts, closed_at=ts)
    async with TestingSessionLocal() as db:
        db.add_all([
            Payment(order_id=o1, tbank_order_id="m-1", amount=1000, status="CONFIRMED", created_at=ts),
            Payment(order_id=o2, tbank_order_id="m-2", amount=2000, status="CONFIRMED", created_at=ts),
            Payment(order_id=o2, tbank_order_id="m-3", amount=500, status="INIT", created_at=ts),  # not settled
        ])
        await db.commit()

    resp = await client.get(
        f"/api/v1/analytics/money{_period_qs('2024-03-01', '2024-03-31')}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["revenueByShipment"]["amount"] == 3000.0
    assert body["revenueByPayment"]["amount"] == 3000.0
    assert body["receiptsPrinted"] == 2  # only CONFIRMED payments count
    assert body["totalDiscount"] == 100.0
    assert body["ordersCount"] == 2
    day_row = next(d for d in body["dailySeries"]["shipment"] if d["date"] == day)
    assert day_row["amount"] == 3000.0


# ═══════════════════════════════ Клиенты ═══════════════════════════════

@pytest_asyncio.fixture
async def customer_seed():
    now = datetime.utcnow()
    long_ago = now - timedelta(days=400)
    recent = now - timedelta(days=5)
    async with TestingSessionLocal() as db:
        once = Customer(name="Разовый", phone="+70000000001")
        churn = Customer(name="Отток", phone="+70000000002")
        active = Customer(name="Активный", phone="+70000000003")
        none_ = Customer(name="Без покупок", phone="+70000000004")
        db.add_all([once, churn, active, none_])
        await db.flush()

        orders = [
            Order(customer_name="", phone="", address="", status="completed", bouquet_ids="[]",
                  total_amount=500, customer_id=once.id, created_at=recent, closed_at=recent),
            Order(customer_name="", phone="", address="", status="completed", bouquet_ids="[]",
                  total_amount=300, customer_id=churn.id, created_at=long_ago, closed_at=long_ago),
            Order(customer_name="", phone="", address="", status="completed", bouquet_ids="[]",
                  total_amount=300, customer_id=churn.id, created_at=long_ago - timedelta(days=30)),
        ]
        for i in range(5):
            orders.append(Order(
                customer_name="", phone="", address="", status="completed", bouquet_ids="[]",
                total_amount=200, customer_id=active.id,
                created_at=recent - timedelta(days=i), closed_at=recent - timedelta(days=i),
            ))
        db.add_all(orders)
        db.add_all([
            CustomerBonusHistory(customer_id=once.id, amount=50, created_at=recent),
            CustomerBonusHistory(customer_id=once.id, amount=-20, created_at=recent),
            CustomerEvent(customer_id=once.id, title="ДР", event_date=recent.date()),
        ])
        await db.commit()
        return {"once": once.id, "churn": churn.id, "active": active.id, "none": none_.id, "recent": recent}


async def test_customers_segmentation(client, worker_token, customer_seed):
    resp = await client.get("/api/v1/analytics/customers", headers=_auth(worker_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["segments"]["onceOnly"]["count"] == 1
    assert body["segments"]["noPurchases"]["count"] == 1
    assert body["segments"]["churnRisk"]["count"] == 1
    assert body["segments"]["activeRegular"]["count"] == 1
    assert body["allTime"]["customersCount"] == 4
    assert body["allTime"]["eventsTotal"] == 1
    assert body["allTime"]["eventsCoveragePct"] == 25.0  # 1 of 4 customers has an event


async def test_customers_buyer_types_and_bonus_system(client, worker_token, customer_seed):
    recent = customer_seed["recent"]
    d_from = (recent - timedelta(days=10)).date().isoformat()
    d_to = (recent + timedelta(days=1)).date().isoformat()
    resp = await client.get(
        f"/api/v1/analytics/customers{_period_qs(d_from, d_to)}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_type = {b["type"]: b for b in body["buyerTypes"]}
    # "once" customer has exactly 1 lifetime order -> classified as "new".
    assert by_type["new"]["count"] == 1
    # "active" customer has 5 lifetime orders, several fall in this window -> "regular".
    assert by_type["regular"]["count"] >= 1
    assert body["bonusSystem"]["accrued"]["total"] == 50.0
    assert body["bonusSystem"]["spent"]["total"] == 20.0
    assert body["bonusSystem"]["efficiencyPct"] == 40.0


# ═══════════════════════════════ Букеты в магазине ═══════════════════════════════

async def test_bouquets_dashboard_revenue_and_weekday(client, worker_token):
    # Monday 2024-03-04 10:00 and Saturday 2024-03-09 12:00 (weekend).
    mon = datetime(2024, 3, 4, 10, 0, 0)
    sat = datetime(2024, 3, 9, 12, 0, 0)
    o1 = await _seed_order(total_amount=1800, created_at=mon, delivery_type="pickup")
    o2 = await _seed_order(total_amount=2200, created_at=sat, delivery_type="delivery")
    async with TestingSessionLocal() as db:
        db.add_all([
            OrderItem(order_id=o1, kind="bouquet", title="Букет 1", unit_price=1800, quantity=1),
            OrderItem(order_id=o2, kind="bouquet", title="Букет 2", unit_price=2200, quantity=1),
            OrderItem(order_id=o2, kind="item", title="Ваза", unit_price=300, quantity=1),
        ])
        await db.commit()

    resp = await client.get(
        f"/api/v1/analytics/bouquets{_period_qs('2024-03-01', '2024-03-31')}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["revenue"] == 4000.0
    assert body["bouquetsSold"] == 2.0
    assert body["soldWithDelivery"] == 1
    weekday_by_label = {w["label"]: w for w in body["weekday"]}
    assert weekday_by_label["Пн"]["count"] == 1.0
    assert weekday_by_label["Сб"]["count"] == 1.0
    assert weekday_by_label["Сб"]["isWeekend"] is True
    ranking_2000 = next(r for r in body["priceRanking"] if r["label"] == "2000–2500 ₽")
    assert ranking_2000["sold"] == 1.0
    top = body["topProducts"]
    assert top[0]["title"] == "Ваза"
    assert top[0]["revenue"] == 300.0


async def test_bouquets_dashboard_legacy_bouquet_ids(client, worker_token):
    """Orders that predate order_items keep their frozen bouquet_ids JSON —
    those lines must still count as bouquet sales (see _legacy_composition)."""
    ts = datetime(2024, 3, 6, 9, 0, 0)
    legacy_lines = json.dumps([{"title": "Легаси букет", "price": 1500, "qty": 1}])
    await _seed_order(total_amount=1500, created_at=ts, bouquet_ids=legacy_lines)

    resp = await client.get(
        f"/api/v1/analytics/bouquets{_period_qs('2024-03-01', '2024-03-31')}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["revenue"] == 1500.0
    assert body["bouquetsSold"] == 1.0


# ═══════════════════════════════ Склад ═══════════════════════════════

@pytest_asyncio.fixture
async def warehouse_seed():
    async with TestingSessionLocal() as db:
        store = Store(title="Точка")
        flowers = Category(title="Цветы")
        packaging = Category(title="Упаковка")
        db.add_all([store, flowers, packaging])
        await db.flush()

        rose = Item(title="Роза", category_id=flowers.id, max_price=200)
        paper = Item(title="Крафт", category_id=packaging.id, max_price=50)
        db.add_all([rose, paper])
        await db.flush()

        warehouse = Warehouse(title="Склад", store_id=store.id)
        db.add(warehouse)
        await db.flush()
        db.add_all([
            StockBalance(warehouse_id=warehouse.id, item_id=rose.id, quantity=10, cost_price=80),
            StockBalance(warehouse_id=warehouse.id, item_id=paper.id, quantity=100, cost_price=5),
        ])

        pi = PackingInvoice(date=datetime(2024, 3, 5).date(), store_id=store.id, total_amount=2500)
        db.add(pi)
        await db.flush()
        db.add_all([
            PackingInvoiceItem(invoice_id=pi.id, item_id=rose.id, quantity=10, price=150, amount=1500),
            PackingInvoiceItem(invoice_id=pi.id, item_id=paper.id, quantity=20, price=50, amount=1000),
        ])

        wo = WriteoffInvoice(date=datetime(2024, 3, 10).date(), store_id=store.id, reason="Порча", total_amount=400)
        db.add(wo)
        await db.flush()
        db.add(WriteoffInvoiceItem(invoice_id=wo.id, item_id=rose.id, quantity=5, cost_price=80))

        act = InventoryAct(
            act_date=datetime(2024, 3, 20).date(), store_id=store.id, financial_result=150,
        )
        act2 = InventoryAct(
            act_date=datetime(2024, 3, 21).date(), store_id=store.id, financial_result=-60,
        )
        db.add_all([act, act2])
        await db.commit()


async def test_warehouse_purchases_and_writeoffs(client, worker_token, warehouse_seed):
    resp = await client.get(
        f"/api/v1/analytics/warehouse{_period_qs('2024-03-01', '2024-03-31')}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_cat = {r["category"]: r["amount"] for r in body["purchasesByCategory"]}
    assert by_cat["Цветы"] == 1500.0
    assert by_cat["Упаковка"] == 1000.0
    assert body["totalPurchases"] == 2500.0
    assert body["writeOffsByReason"][0]["reason"] == "Порча"
    assert body["writeOffsByReason"][0]["amount"] == 400.0
    assert body["writtenOffTop"]["byAmount"][0]["title"] == "Роза"
    assert body["writtenOffTop"]["byAmount"][0]["amount"] == 400.0  # 5 * 80


async def test_warehouse_inventory_result_and_stock_value(client, worker_token, warehouse_seed):
    resp = await client.get(
        f"/api/v1/analytics/warehouse{_period_qs('2024-03-01', '2024-03-31')}", headers=_auth(worker_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["inventoryResult"]["surplus"] == 150.0
    assert body["inventoryResult"]["shortage"] == 60.0
    assert body["inventoryResult"]["net"] == 90.0
    # stock retail value = 10*200 (rose) + 100*50 (paper) = 7000
    assert body["right"]["stockRetailValue"] == 7000.0
    # stock cost value = 10*80 + 100*5 = 1300, all lumped into "other" (see
    # comment in v1_analytics.py — category has no flower/other flag).
    assert body["right"]["stockOtherCost"] == 1300.0
    assert body["right"]["stockFlowersCost"] == 0.0
