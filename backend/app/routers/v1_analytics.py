"""Phase 4 — admin dashboard analytics (docs/posiflora/admin-map.md §2.1).

Not a Posiflora-shaped JSON:API resource — the vendor's real analytics
endpoints weren't captured, so this is our own aggregate response tailored to
the four "Аналитика" tabs (Деньги / Клиенты / Букеты в магазине / Склад).
Metrics the underlying tables have no data for (cost-of-goods → gross margin,
till/cash-register balance, flower-vs-other stock split) are returned as
`null`/0 rather than a fabricated number — see each field's comment below.
"""

import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Order, Payment
from app.staff_models import Worker
from app.dictionary_models import CustomerDealSource
from app.catalog_models import Customer, CustomerBonusHistory, Category
from app.loyalty_models import CustomerEvent
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

from app.deps import get_current_worker
from app.analytics_helpers import (
    period_bounds,
    dt_bounds,
    pct_change,
    daily_series,
    WEEKDAY_LABELS,
)

router = APIRouter(
    prefix="/v1/analytics",
    tags=["v1-analytics"],
    dependencies=[Depends(get_current_worker)],
)


def _period_meta(period_from: date, period_to: date) -> dict:
    return {
        "period": {"from": period_from.isoformat(), "to": period_to.isoformat()},
        "updatedAt": datetime.utcnow().isoformat(),
    }


# ═══════════════════════════════ Деньги ═══════════════════════════════

@router.get("/money")
async def money_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    period_from, period_to, prev_from, prev_to = period_bounds(qs, today.replace(day=1), today)
    store_id = qs.get("store")
    dt_from, dt_to = dt_bounds(period_from, period_to)

    def _orders_query(d_from: date, d_to: date):
        f, t = dt_bounds(d_from, d_to)
        stmt = select(Order).where(Order.created_at >= f, Order.created_at <= t)
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    def _payments_query(d_from: date, d_to: date):
        f, t = dt_bounds(d_from, d_to)
        stmt = (
            select(Payment.created_at, Payment.amount)
            .select_from(Payment)
            .join(Order, Order.id == Payment.order_id)
            .where(
                Payment.status.in_(("CONFIRMED", "paid")),
                Payment.created_at >= f, Payment.created_at <= t,
            )
        )
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    orders = (await db.execute(_orders_query(period_from, period_to))).scalars().all()
    prev_orders = (await db.execute(_orders_query(prev_from, prev_to))).scalars().all()
    payment_rows = (await db.execute(_payments_query(period_from, period_to))).all()
    prev_payment_rows = (await db.execute(_payments_query(prev_from, prev_to))).all()

    revenue_shipment = float(sum(o.total_amount for o in orders))
    prev_revenue_shipment = float(sum(o.total_amount for o in prev_orders))
    revenue_payment = float(sum(a for _, a in payment_rows))
    prev_revenue_payment = float(sum(a for _, a in prev_payment_rows))

    orders_count = len(orders)
    avg_check = revenue_shipment / orders_count if orders_count else 0.0
    returns = [o for o in orders if o.status == "return"]
    returns_amount = float(sum(o.total_amount for o in returns))

    # Реально доступные метрики, которых раньше не было: чеки (кол-во
    # подтверждённых платежей) и суммарная скидка по заказам.
    receipts_printed = len(payment_rows)
    total_discount = float(sum(o.discount_total for o in orders))

    # Сотрудники: group by florist, falling back to whoever created the order
    # when no florist is assigned yet.
    worker_ids = {o.florist_id or o.created_by_id for o in orders if (o.florist_id or o.created_by_id)}
    workers_by_id: dict[str, Worker] = {}
    if worker_ids:
        rows = (await db.execute(select(Worker).where(Worker.id.in_(worker_ids)))).scalars().all()
        workers_by_id = {w.id: w for w in rows}

    by_worker: dict[str, list] = {}
    for o in orders:
        wid = o.florist_id or o.created_by_id
        by_worker.setdefault(wid, []).append(o)
    employees = []
    for wid, group in by_worker.items():
        sales = float(sum(o.total_amount for o in group))
        worker = workers_by_id.get(wid) if wid else None
        employees.append({
            "workerId": wid,
            "name": worker.name if worker else "Без исполнителя",
            "avgCheck": round(sales / len(group), 2) if group else 0,
            "sales": sales,
            "sharePct": round(sales / revenue_shipment * 100, 1) if revenue_shipment else 0,
        })
    employees.sort(key=lambda e: e["sales"], reverse=True)

    # Источники сделки
    source_ids = {o.source_id for o in orders if o.source_id}
    sources_by_id: dict[str, CustomerDealSource] = {}
    if source_ids:
        rows = (await db.execute(select(CustomerDealSource).where(CustomerDealSource.id.in_(source_ids)))).scalars().all()
        sources_by_id = {s.id: s for s in rows}
    by_source: dict[str, list] = {}
    for o in orders:
        key = o.source_id or ""
        by_source.setdefault(key, []).append(o)
    deal_sources = []
    for key, group in by_source.items():
        amount = float(sum(o.total_amount for o in group))
        title = sources_by_id[key].title if key and key in sources_by_id else "Без источника"
        deal_sources.append({
            "title": title,
            "amount": amount,
            "sharePct": round(amount / revenue_shipment * 100, 1) if revenue_shipment else 0,
        })
    deal_sources.sort(key=lambda s: s["amount"], reverse=True)

    # Способы оплаты — only one gateway is integrated (T-Bank online).
    payment_methods = []
    if revenue_payment:
        payment_methods.append({"title": "Онлайн-оплата (Т-Банк)", "amount": revenue_payment, "sharePct": 100.0})

    # Грядущие заказы на неделю — next 7 calendar days from today, by due_time.
    due_stmt = select(Order.due_time).where(Order.due_time.is_not(None))
    if store_id:
        due_stmt = due_stmt.where(Order.store_id == store_id)
    all_due = [r[0] for r in (await db.execute(due_stmt)).all()]
    upcoming = []
    for i in range(7):
        day_str = (today + timedelta(days=i)).isoformat()
        count = sum(1 for d in all_due if d and d.startswith(day_str))
        upcoming.append({"date": day_str, "ordersCount": count})

    daily_shipment = daily_series([(o.created_at, float(o.total_amount)) for o in orders], period_from, period_to)
    daily_payment = daily_series(list(payment_rows), period_from, period_to)

    return {
        **_period_meta(period_from, period_to),
        "revenueByShipment": {
            "amount": revenue_shipment,
            "changePct": pct_change(revenue_shipment, prev_revenue_shipment),
        },
        "revenueByPayment": {
            "amount": revenue_payment,
            "changePct": pct_change(revenue_payment, prev_revenue_payment),
        },
        # No cost-of-goods anywhere in the order/order-item model — a "gross
        # margin" number here would be fabricated, so it stays null.
        "grossProfit": None,
        "marginPct": None,
        "totalDiscount": round(total_discount, 2),
        "receiptsPrinted": receipts_printed,
        "ordersCount": orders_count,
        "avgCheck": round(avg_check, 2),
        "returnsCount": len(returns),
        "returnsAmount": returns_amount,
        "employees": employees,
        "paymentMethods": payment_methods,
        "dealSources": deal_sources,
        "upcomingWeek": upcoming,
        "dailySeries": {
            "shipment": daily_shipment,
            "payment": daily_payment,
            # Gross margin has no data source (see grossProfit above) — the
            # chart shows "no data" rather than a fake flat line.
            "margin": [],
        },
    }


# ═══════════════════════════════ Клиенты ═══════════════════════════════

@router.get("/customers")
async def customers_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    period_from, period_to, prev_from, prev_to = period_bounds(qs, today.replace(day=1), today)
    store_id = qs.get("store")
    dt_from, dt_to = dt_bounds(period_from, period_to)
    now = datetime.utcnow()
    twelve_months_ago = now - timedelta(days=365)

    # All-time per-customer order stats (segmentation is a CRM property of the
    # customer, not bound to the money-tab period). Scoped to `store` when set.
    stats_stmt = (
        select(Order.customer_id, func.count(Order.id), func.max(Order.created_at))
        .where(Order.customer_id.is_not(None))
        .group_by(Order.customer_id)
    )
    if store_id:
        stats_stmt = stats_stmt.where(Order.store_id == store_id)
    stats_rows = (await db.execute(stats_stmt)).all()

    lifetime_count: dict[str, int] = {}
    once_only = churn_risk = active_regular = 0
    for cust_id, cnt, last_at in stats_rows:
        lifetime_count[cust_id] = cnt
        if cnt == 1:
            once_only += 1
        if cnt >= 2 and last_at and last_at < twelve_months_ago:
            churn_risk += 1
        if cnt >= 5 and last_at and last_at >= twelve_months_ago:
            active_regular += 1

    total_customers = (await db.execute(select(func.count(Customer.id)))).scalar_one()
    no_purchases = max(0, total_customers - len(lifetime_count))

    # Новые клиенты за период
    new_cust_stmt = select(Customer.created_at).where(Customer.created_at >= dt_from, Customer.created_at <= dt_to)
    new_rows = (await db.execute(new_cust_stmt)).all()
    new_customers = {
        "count": len(new_rows),
        "days": daily_series([(r[0], 1) for r in new_rows], period_from, period_to),
    }

    # Заказы «закрыто» (completed) в периоде — доля с привязанным клиентом.
    closed_stmt = select(Order.customer_id).where(
        Order.status == "completed", Order.created_at >= dt_from, Order.created_at <= dt_to
    )
    if store_id:
        closed_stmt = closed_stmt.where(Order.store_id == store_id)
    closed_rows = (await db.execute(closed_stmt)).all()
    total_closed = len(closed_rows)
    with_customer = sum(1 for (cid,) in closed_rows if cid)
    orders_with_customer_pct = round(with_customer / total_closed * 100, 1) if total_closed else 0

    # Правая колонка — «за всё время»
    bonuses_total = (await db.execute(select(func.coalesce(func.sum(Customer.bonus_balance), 0)))).scalar_one()
    accrued_alltime = float((await db.execute(
        select(func.coalesce(func.sum(CustomerBonusHistory.amount), 0)).where(CustomerBonusHistory.amount > 0)
    )).scalar_one())
    spent_alltime = float((await db.execute(
        select(func.coalesce(func.sum(CustomerBonusHistory.amount), 0)).where(CustomerBonusHistory.amount < 0)
    )).scalar_one())
    spent_alltime = abs(spent_alltime)
    bonus_efficiency_alltime = round(spent_alltime / accrued_alltime * 100, 1) if accrued_alltime else None

    events_total = (await db.execute(select(func.count(CustomerEvent.id)))).scalar_one()
    events_customers = (await db.execute(
        select(func.count(func.distinct(CustomerEvent.customer_id)))
    )).scalar_one()
    events_coverage_pct = round(events_customers / total_customers * 100, 1) if total_customers else 0

    # Заказы периода — классификация по типу клиента для таблицы «Покупатели».
    period_orders_stmt = select(Order).where(Order.created_at >= dt_from, Order.created_at <= dt_to)
    if store_id:
        period_orders_stmt = period_orders_stmt.where(Order.store_id == store_id)
    period_orders = (await db.execute(period_orders_stmt)).scalars().all()

    buckets: dict[str, list] = {"regular": [], "new": [], "anon": []}
    for o in period_orders:
        if not o.customer_id:
            buckets["anon"].append(o)
        elif lifetime_count.get(o.customer_id, 0) <= 1:
            buckets["new"].append(o)
        else:
            buckets["regular"].append(o)

    total_sales = float(sum(o.total_amount for o in period_orders))
    labels = {"regular": "Постоянные", "new": "Новые", "anon": "Обезличенные"}
    buyer_types = []
    sales_by_segment = {}
    for key in ("regular", "new", "anon"):
        group = buckets[key]
        sales = float(sum(o.total_amount for o in group))
        buyer_types.append({
            "type": key,
            "title": labels[key],
            "count": len(group),
            "sales": round(sales, 2),
            "avgCheck": round(sales / len(group), 2) if group else 0,
            "sharePct": round(sales / total_sales * 100, 1) if total_sales else 0,
        })
        sales_by_segment[key] = {
            "total": round(sales, 2),
            "days": daily_series([(o.created_at, float(o.total_amount)) for o in group], period_from, period_to),
        }

    # Бонусная система за период
    bonus_hist_stmt = select(CustomerBonusHistory.amount, CustomerBonusHistory.created_at).where(
        CustomerBonusHistory.created_at >= dt_from, CustomerBonusHistory.created_at <= dt_to
    )
    hist_rows = (await db.execute(bonus_hist_stmt)).all()
    accrued_pairs = [(ts, amt) for amt, ts in hist_rows if amt > 0]
    spent_pairs = [(ts, abs(amt)) for amt, ts in hist_rows if amt < 0]
    accrued_total = float(sum(p[1] for p in accrued_pairs))
    spent_total = float(sum(p[1] for p in spent_pairs))

    return {
        **_period_meta(period_from, period_to),
        "segments": {
            "onceOnly": {"count": once_only},
            "noPurchases": {"count": no_purchases},
            "churnRisk": {"count": churn_risk},
            "activeRegular": {"count": active_regular},
        },
        "newCustomers": new_customers,
        "ordersWithCustomerPct": orders_with_customer_pct,
        "allTime": {
            "customersCount": total_customers,
            "bonusesTotal": int(bonuses_total),
            "bonusEfficiencyPct": bonus_efficiency_alltime,
            "eventsTotal": events_total,
            "eventsCoveragePct": events_coverage_pct,
        },
        "buyerTypes": buyer_types,
        "salesBySegment": sales_by_segment,
        "bonusSystem": {
            "accrued": {"total": round(accrued_total, 2), "days": daily_series(accrued_pairs, period_from, period_to)},
            "spent": {"total": round(spent_total, 2), "days": daily_series(spent_pairs, period_from, period_to)},
            "efficiencyPct": round(spent_total / accrued_total * 100, 1) if accrued_total else None,
        },
    }


# ═══════════════════════════════ Букеты в магазине ═══════════════════════════════

@router.get("/bouquets")
async def bouquets_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    period_from, period_to, prev_from, prev_to = period_bounds(qs, today.replace(day=1), today)
    store_id = qs.get("store")
    dt_from, dt_to = dt_bounds(period_from, period_to)

    order_stmt = (
        select(Order)
        .where(Order.created_at >= dt_from, Order.created_at <= dt_to)
        .options(selectinload(Order.items))
    )
    if store_id:
        order_stmt = order_stmt.where(Order.store_id == store_id)
    orders = (await db.execute(order_stmt)).scalars().all()

    # (order, title, unit_price, quantity, created_at)
    bouquet_lines: list[tuple] = []
    item_lines: list[tuple] = []  # (title, quantity, revenue)
    delivered_bouquet_orders = 0

    for o in orders:
        real_items = list(o.items)
        has_bouquet = False
        if real_items:
            for it in real_items:
                if it.kind == "bouquet":
                    bouquet_lines.append((o, it.title, float(it.unit_price), float(it.quantity), o.created_at))
                    has_bouquet = True
                elif it.kind == "item":
                    item_lines.append((it.title, float(it.quantity), float(it.unit_price) * float(it.quantity)))
        else:
            # Legacy ETL/checkout orders (no order_items rows): the priced
            # lines live in bouquet_ids JSON and are always shown as "bouquet"
            # rows, matching routers/v1_sales.py::_legacy_composition.
            try:
                lines = json.loads(o.bouquet_ids) if o.bouquet_ids else []
            except (TypeError, ValueError):
                lines = []
            for line in lines if isinstance(lines, list) else []:
                if not isinstance(line, dict):
                    continue
                price = float(line.get("price") or 0)
                qty = float(line.get("qty") or 1)
                bouquet_lines.append((o, line.get("title") or "Букет", price, qty, o.created_at))
                has_bouquet = True
        if has_bouquet and o.delivery_type == "delivery":
            delivered_bouquet_orders += 1

    revenue = sum(price * qty for _, _, price, qty, _ in bouquet_lines)
    bouquets_sold = sum(qty for _, _, _, qty, _ in bouquet_lines)
    avg_price = revenue / bouquets_sold if bouquets_sold else 0
    period_days = (period_to - period_from).days + 1
    avg_per_day = bouquets_sold / period_days if period_days else 0

    weekday_counts = [0.0] * 7
    for _, _, _, qty, created_at in bouquet_lines:
        wd = created_at.weekday() if created_at else 0
        weekday_counts[wd] += qty
    weekday = [
        {"label": WEEKDAY_LABELS[i], "count": round(weekday_counts[i], 1), "isWeekend": i >= 5}
        for i in range(7)
    ]

    hourly_revenue = [0.0] * 24
    for _, _, price, qty, created_at in bouquet_lines:
        h = created_at.hour if created_at else 0
        hourly_revenue[h] += price * qty
    hourly = [{"hour": h, "revenue": round(hourly_revenue[h], 2)} for h in range(24)]

    ranges = [(1000, 1500), (1500, 2000), (2000, 2500), (2500, 5000), (5000, 7500)]
    ranking = []
    for lo, hi in ranges:
        sold = sum(qty for _, _, price, qty, _ in bouquet_lines if lo <= price < hi)
        rev = sum(price * qty for _, _, price, qty, _ in bouquet_lines if lo <= price < hi)
        ranking.append({"label": f"{lo}–{hi} ₽", "sold": round(sold, 1), "revenue": round(rev, 2)})
    ranking.sort(key=lambda r: r["revenue"], reverse=True)

    by_title: dict[str, list] = {}
    for title, qty, rev in item_lines:
        agg = by_title.setdefault(title, [0.0, 0.0])
        agg[0] += qty
        agg[1] += rev
    top_products = [{"title": t, "sold": round(v[0], 2), "revenue": round(v[1], 2)} for t, v in by_title.items()]
    top_products.sort(key=lambda p: p["revenue"], reverse=True)
    top_products = top_products[:5]

    return {
        **_period_meta(period_from, period_to),
        "revenue": round(revenue, 2),
        "avgPrice": round(avg_price, 2),
        # No cost-of-goods for bouquets/items — see money_dashboard comment.
        "marginPct": None,
        "bouquetsSold": round(bouquets_sold, 1),
        "soldWithDelivery": delivered_bouquet_orders,
        "avgPerDay": round(avg_per_day, 2),
        "weekday": weekday,
        "hourly": hourly,
        "priceRanking": ranking,
        "topProducts": top_products,
    }


# ═══════════════════════════════ Склад ═══════════════════════════════

@router.get("/warehouse")
async def warehouse_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    period_from, period_to, prev_from, prev_to = period_bounds(qs, today.replace(day=1), today)
    store_id = qs.get("store")

    # Приходные накладные — по категории номенклатуры.
    pi_stmt = (
        select(Category.title, func.coalesce(func.sum(PackingInvoiceItem.amount), 0))
        .select_from(PackingInvoiceItem)
        .join(PackingInvoice, PackingInvoice.id == PackingInvoiceItem.invoice_id)
        .join(Item, Item.id == PackingInvoiceItem.item_id)
        .outerjoin(Category, Category.id == Item.category_id)
        .where(PackingInvoice.date >= period_from, PackingInvoice.date <= period_to)
        .group_by(Category.title)
    )
    if store_id:
        pi_stmt = pi_stmt.where(PackingInvoice.store_id == store_id)
    pi_rows = (await db.execute(pi_stmt)).all()
    purchases_by_category = [
        {"category": title or "Без категории", "amount": float(amount)} for title, amount in pi_rows
    ]
    purchases_by_category.sort(key=lambda r: r["amount"], reverse=True)
    total_purchases = sum(r["amount"] for r in purchases_by_category)

    packing_count_stmt = select(func.count(PackingInvoice.id)).where(
        PackingInvoice.date >= period_from, PackingInvoice.date <= period_to
    )
    if store_id:
        packing_count_stmt = packing_count_stmt.where(PackingInvoice.store_id == store_id)
    packing_invoices_count = (await db.execute(packing_count_stmt)).scalar_one()

    # Списания по причинам.
    wo_stmt = (
        select(WriteoffInvoice.reason, func.coalesce(func.sum(WriteoffInvoice.total_amount), 0))
        .where(WriteoffInvoice.date >= period_from, WriteoffInvoice.date <= period_to)
        .group_by(WriteoffInvoice.reason)
    )
    if store_id:
        wo_stmt = wo_stmt.where(WriteoffInvoice.store_id == store_id)
    wo_rows = (await db.execute(wo_stmt)).all()
    total_write_offs = float(sum(float(a) for _, a in wo_rows))
    write_offs_by_reason = [
        {
            "reason": r or "Списание",
            "amount": float(a),
            "sharePct": round(float(a) / total_write_offs * 100, 1) if total_write_offs else 0,
        }
        for r, a in wo_rows
    ]
    write_offs_by_reason.sort(key=lambda r: r["amount"], reverse=True)

    write_off_count_stmt = select(func.count(WriteoffInvoice.id)).where(
        WriteoffInvoice.date >= period_from, WriteoffInvoice.date <= period_to
    )
    if store_id:
        write_off_count_stmt = write_off_count_stmt.where(WriteoffInvoice.store_id == store_id)
    write_off_invoices_count = (await db.execute(write_off_count_stmt)).scalar_one()

    # Инвентаризация: излишки/недостачи/результат из InventoryAct.financial_result.
    inv_stmt = select(InventoryAct.financial_result).where(
        InventoryAct.act_date >= period_from, InventoryAct.act_date <= period_to
    )
    if store_id:
        inv_stmt = inv_stmt.where(InventoryAct.store_id == store_id)
    inv_rows = [float(r[0] or 0) for r in (await db.execute(inv_stmt)).all()]
    surplus = sum(v for v in inv_rows if v > 0)
    shortage = sum(-v for v in inv_rows if v < 0)
    inventory_result = {
        "surplus": round(surplus, 2),
        "shortage": round(shortage, 2),
        "net": round(surplus - shortage, 2),
    }

    inventory_acts_count_stmt = select(func.count(InventoryAct.id)).where(
        InventoryAct.act_date >= period_from, InventoryAct.act_date <= period_to
    )
    if store_id:
        inventory_acts_count_stmt = inventory_acts_count_stmt.where(InventoryAct.store_id == store_id)
    inventory_acts_count = (await db.execute(inventory_acts_count_stmt)).scalar_one()

    # Списанные товары — топ-10 по сумме себестоимости и по количеству.
    wo_item_stmt = (
        select(
            Item.title,
            func.coalesce(func.sum(WriteoffInvoiceItem.quantity), 0),
            func.coalesce(func.sum(WriteoffInvoiceItem.quantity * WriteoffInvoiceItem.cost_price), 0),
        )
        .select_from(WriteoffInvoiceItem)
        .join(WriteoffInvoice, WriteoffInvoice.id == WriteoffInvoiceItem.invoice_id)
        .join(Item, Item.id == WriteoffInvoiceItem.item_id)
        .where(WriteoffInvoice.date >= period_from, WriteoffInvoice.date <= period_to)
        .group_by(Item.title)
    )
    if store_id:
        wo_item_stmt = wo_item_stmt.where(WriteoffInvoice.store_id == store_id)
    wo_item_rows = (await db.execute(wo_item_stmt)).all()
    written_off_items = [
        {"title": t, "quantity": float(q), "amount": float(a)} for t, q, a in wo_item_rows
    ]
    total_wo_qty = sum(i["quantity"] for i in written_off_items)
    total_wo_amt = sum(i["amount"] for i in written_off_items)
    by_amount = sorted(written_off_items, key=lambda i: i["amount"], reverse=True)[:10]
    by_qty = sorted(written_off_items, key=lambda i: i["quantity"], reverse=True)[:10]
    for i in by_amount:
        i["sharePct"] = round(i["amount"] / total_wo_amt * 100, 1) if total_wo_amt else 0
    for i in by_qty:
        i["sharePct"] = round(i["quantity"] / total_wo_qty * 100, 1) if total_wo_qty else 0
    reasons = sorted({r for r, _ in wo_rows if r})

    # Правая колонка — остатки склада.
    sb_stmt = select(StockBalance.quantity, StockBalance.cost_price, Item.max_price).join(
        Item, Item.id == StockBalance.item_id
    )
    if store_id:
        sb_stmt = sb_stmt.join(Warehouse, Warehouse.id == StockBalance.warehouse_id).where(
            Warehouse.store_id == store_id
        )
    sb_rows = (await db.execute(sb_stmt)).all()
    stock_retail_value = sum(float(q or 0) * float(mp or 0) for q, _, mp in sb_rows)
    stock_cost_value = sum(float(q or 0) * float(cp or 0) for q, cp, _ in sb_rows)
    write_off_pct = round(total_write_offs / stock_retail_value * 100, 1) if stock_retail_value else 0

    return {
        **_period_meta(period_from, period_to),
        "purchasesByCategory": purchases_by_category,
        "totalPurchases": round(total_purchases, 2),
        "writeOffsByReason": write_offs_by_reason,
        "totalWriteOffs": round(total_write_offs, 2),
        "inventoryResult": inventory_result,
        "writtenOffTop": {"byAmount": by_amount, "byQuantity": by_qty, "reasons": reasons},
        "right": {
            "stockRetailValue": round(stock_retail_value, 2),
            "writeOffPct": write_off_pct,
            # Item categories carry no "is this a flower" flag in the data
            # (Category.group_id is an opaque ETL id), so the flower/other
            # split can't be derived honestly — the whole cost value is kept
            # in "other" rather than guessing by category title.
            "stockFlowersCost": 0.0,
            "stockOtherCost": round(stock_cost_value, 2),
            "writeOffInvoicesCount": write_off_invoices_count,
            "packingInvoicesCount": packing_invoices_count,
            "inventoryActsCount": inventory_acts_count,
        },
    }
