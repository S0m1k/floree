"""Phase 4 — admin dashboard analytics (docs/posiflora/admin-map.md §2.1).

Not a Posiflora-shaped JSON:API resource — the vendor's real analytics
endpoints weren't captured, so this is our own aggregate response tailored to
the "Деньги" tab widgets. Metrics the checkout-order model has no data for
(gross margin, discounts, printed receipts, advances, bonuses, customer debt)
are returned as `null` rather than a fabricated number — see each field's
comment below.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Order, Payment
from app.staff_models import Worker
from app.dictionary_models import CustomerDealSource

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1/analytics",
    tags=["v1-analytics"],
    dependencies=[Depends(get_current_worker)],
)


def _parse_date(s: str | None, default: date) -> date:
    if not s:
        return default
    try:
        return date.fromisoformat(s)
    except ValueError:
        return default


def _pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


@router.get("/money")
async def money_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    default_from = today.replace(day=1)
    period_from = _parse_date(qs.get("from"), default_from)
    period_to = _parse_date(qs.get("to"), today)
    store_id = qs.get("store")

    period_len = (period_to - period_from).days + 1
    prev_to = period_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_len - 1)

    def _dt(d: date, end_of_day: bool = False) -> datetime:
        return datetime.combine(d, datetime.max.time() if end_of_day else datetime.min.time())

    def _orders_query(d_from: date, d_to: date):
        stmt = select(Order).where(
            Order.created_at >= _dt(d_from), Order.created_at <= _dt(d_to, True)
        )
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    def _payments_query(d_from: date, d_to: date):
        stmt = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Order, Order.id == Payment.order_id)
            .where(
                Payment.status.in_(("CONFIRMED", "paid")),
                Payment.created_at >= _dt(d_from), Payment.created_at <= _dt(d_to, True),
            )
        )
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    orders = (await db.execute(_orders_query(period_from, period_to))).scalars().all()
    prev_orders = (await db.execute(_orders_query(prev_from, prev_to))).scalars().all()

    revenue_shipment = float(sum(o.total_amount for o in orders))
    prev_revenue_shipment = float(sum(o.total_amount for o in prev_orders))
    revenue_payment = float((await db.execute(_payments_query(period_from, period_to))).scalar_one())
    prev_revenue_payment = float((await db.execute(_payments_query(prev_from, prev_to))).scalar_one())

    orders_count = len(orders)
    avg_check = revenue_shipment / orders_count if orders_count else 0.0
    returns = [o for o in orders if o.status == "return"]
    returns_amount = float(sum(o.total_amount for o in returns))

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
    # Looks forward from today regardless of the money-tab period selector, so
    # it queries independently of `orders` above (no created_at bound). Bucket
    # by date prefix in Python since due_time is a free-form ISO string.
    due_stmt = select(Order.due_time).where(Order.due_time.is_not(None))
    if store_id:
        due_stmt = due_stmt.where(Order.store_id == store_id)
    all_due = [r[0] for r in (await db.execute(due_stmt)).all()]
    upcoming = []
    for i in range(7):
        day_str = (today + timedelta(days=i)).isoformat()
        count = sum(1 for d in all_due if d and d.startswith(day_str))
        upcoming.append({"date": day_str, "ordersCount": count})

    return {
        "period": {"from": period_from.isoformat(), "to": period_to.isoformat()},
        "updatedAt": datetime.utcnow().isoformat(),
        "revenueByShipment": {
            "amount": revenue_shipment,
            "changePct": _pct_change(revenue_shipment, prev_revenue_shipment),
        },
        "revenueByPayment": {
            "amount": revenue_payment,
            "changePct": _pct_change(revenue_payment, prev_revenue_payment),
        },
        # Not tracked by the current order model — no cost-of-goods, discount,
        # or receipt-printing data exists yet.
        "grossProfit": None,
        "totalDiscount": None,
        "receiptsPrinted": None,
        "marginPct": None,
        "ordersCount": orders_count,
        "avgCheck": round(avg_check, 2),
        "returnsCount": len(returns),
        "returnsAmount": returns_amount,
        "employees": employees,
        "paymentMethods": payment_methods,
        "dealSources": deal_sources,
        "upcomingWeek": upcoming,
    }
