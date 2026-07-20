"""Учёт и финансы → Отчёты / Финансовый учёт / история выгрузок
(docs/posiflora/admin-map.md §2.4.5-2.4.8).

- Расходы (`expenses`): CRUD backing /admin/financial-accounting «Список
  расходов». Статья is a fixed dictionary (EXPENSE_ARTICLES), not free text.
- P&L (`GET /v1/finance/pnl`): the «Прибыль и убытки» tab's summary —
  gross profit minus manual expenses minus posted stock write-offs.
  Cost-of-goods is derived from order_items' StockBalance.cost_price, which
  isn't captured for every item (see `_cost_of_goods` docstring) — the
  response is honest about that via coveredItems/totalItems rather than
  silently treating missing cost data as zero margin impact.
- Отчёты (`GET/POST /v1/reports`, .../refresh, .../download): five CSV
  report types, generated server-side and persisted to `generated_files` so
  they can be re-downloaded without re-querying.
- `GET/POST /v1/generated-files`: the generic ledger both /admin/reports and
  /admin/exports-list / /admin/items-export read from. POST is also how the
  existing customers/items CSV-export route handlers (src/app/admin/api/
  customers/export, .../inventory-items/export) record their own runs.
"""

import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Store, Category
from app.models import Order, OrderItem, Payment, SETTLED_PAYMENT_STATUSES
from app.inventory_models import (
    Item,
    StockBalance,
    PackingInvoice,
    PackingInvoiceItem,
    WriteoffInvoice,
    WriteoffInvoiceItem,
    Vendor,
)
from app.finance_models import (
    Expense,
    GeneratedFile,
    EXPENSE_ARTICLES,
    REPORT_KINDS,
    GENERATED_FILE_KINDS,
)
from app.jsonapi import document
from app.serializers import expense_resource, generated_file_resource
from app.deps import get_current_worker
from app.analytics_helpers import parse_date, dt_bounds
from app.staff_models import Worker

router = APIRouter(prefix="/v1", tags=["v1-finance"], dependencies=[Depends(get_current_worker)])

REPORT_TITLES = {
    "payments": "Оплаты",
    "sales": "Продажи",
    "vendors": "Поставщики",
    "goods-flow": "Движение товаров",
    "bouquets": "Букеты",
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ═══════════════════════════════ Расходы ═══════════════════════════════


def _paginate(qs) -> tuple[int, int]:
    try:
        number = int(qs.get("page[number]", 1))
        size = int(qs.get("page[size]", 50))
    except (TypeError, ValueError):
        number, size = 1, 50
    return max(number, 1), max(min(size, 500), 1)


@router.get("/expenses")
async def list_expenses(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _paginate(qs)

    stmt = select(Expense)
    d_from = qs.get("filter[from]") or qs.get("from")
    d_to = qs.get("filter[to]") or qs.get("to")
    store_id = qs.get("filter[store]") or qs.get("store")
    q = (qs.get("filter[q]") or qs.get("q") or "").strip()

    if d_from:
        stmt = stmt.where(Expense.date >= parse_date(d_from, date.min))
    if d_to:
        stmt = stmt.where(Expense.date <= parse_date(d_to, date.max))
    if store_id:
        stmt = stmt.where(Expense.store_id == store_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Expense.article.ilike(like), Expense.comment.ilike(like)))

    subq = stmt.subquery()
    count_stmt = select(func.count(), func.coalesce(func.sum(subq.c.amount), 0)).select_from(subq)
    count, amount_sum = (await db.execute(count_stmt)).one()

    rows = (
        await db.execute(
            stmt.order_by(Expense.date.desc(), Expense.created_at.desc())
            .offset((number - 1) * size)
            .limit(size)
        )
    ).scalars().all()

    return document(
        [expense_resource(r) for r in rows],
        meta={"page": {"number": number, "size": size, "count": count}, "total": float(amount_sum)},
    )


def _extract_expense_attrs(attrs: dict) -> dict:
    article = attrs.get("article")
    if article not in EXPENSE_ARTICLES:
        raise HTTPException(status_code=400, detail=f"article must be one of {EXPENSE_ARTICLES}")

    try:
        amount = Decimal(str(attrs.get("amount")))
    except Exception:
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")

    raw_date = attrs.get("date")
    if not raw_date:
        raise HTTPException(status_code=400, detail="date is required")
    try:
        exp_date = date.fromisoformat(str(raw_date)[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be an ISO date")

    return {"article": article, "amount": amount, "date": exp_date, "comment": (attrs.get("comment") or None)}


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


@router.post("/expenses", status_code=201)
async def create_expense(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    body = await request.json()
    data = (body or {}).get("data") or {}
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    store_id = _rel_id(rels, "store") or attrs.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="store is required")
    store = (await db.execute(select(Store).where(Store.id == store_id))).scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=400, detail="store not found")

    fields = _extract_expense_attrs(attrs)
    row = Expense(**fields, store_id=store_id, created_by_id=worker.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(expense_resource(row))


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ═══════════════════════════════ P&L ═══════════════════════════════


async def _cost_of_goods(db: AsyncSession, period_from: date, period_to: date, store_id: str | None):
    """Sums (quantity × StockBalance.cost_price) for kind='item' order lines
    of orders shipped in the period. Not every item has a StockBalance row
    with a real cost_price recorded (only 347 of the catalog does, per the
    seeded data) — a line with no match contributes 0 and is counted as
    "not covered" rather than silently assumed free, so the P&L screen can
    show the gap instead of pretending costOfGoods is exact.
    """
    f, t = dt_bounds(period_from, period_to)
    stmt = (
        select(OrderItem.inventory_item_id, OrderItem.quantity)
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.kind == "item", Order.created_at >= f, Order.created_at <= t)
    )
    if store_id:
        stmt = stmt.where(Order.store_id == store_id)
    lines = (await db.execute(stmt)).all()

    item_ids = {iid for iid, _ in lines if iid}
    cost_by_item: dict[str, Decimal] = {}
    if item_ids:
        cost_rows = (
            await db.execute(
                select(StockBalance.item_id, func.avg(StockBalance.cost_price))
                .where(StockBalance.item_id.in_(item_ids))
                .group_by(StockBalance.item_id)
            )
        ).all()
        cost_by_item = {iid: Decimal(str(cp or 0)) for iid, cp in cost_rows}

    total_items = len(lines)
    covered_items = 0
    cost_total = Decimal("0")
    for item_id, qty in lines:
        cost = cost_by_item.get(item_id) if item_id else None
        if cost is not None:
            covered_items += 1
            cost_total += cost * Decimal(str(qty or 0))
    return cost_total, covered_items, total_items


@router.get("/finance/pnl")
async def finance_pnl(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    today = date.today()
    period_from = parse_date(qs.get("from"), today.replace(day=1))
    period_to = parse_date(qs.get("to"), today)
    if period_to < period_from:
        period_from, period_to = period_to, period_from
    store_id = qs.get("store")

    f, t = dt_bounds(period_from, period_to)

    payments_stmt = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .select_from(Payment)
        .join(Order, Order.id == Payment.order_id)
        .where(
            Payment.status.in_(SETTLED_PAYMENT_STATUSES),
            Payment.created_at >= f,
            Payment.created_at <= t,
        )
    )
    if store_id:
        payments_stmt = payments_stmt.where(Order.store_id == store_id)
    revenue = Decimal(str((await db.execute(payments_stmt)).scalar_one() or 0))

    cost_of_goods, covered_items, total_items = await _cost_of_goods(db, period_from, period_to, store_id)

    gross_profit = revenue - cost_of_goods

    expenses_stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.date >= period_from, Expense.date <= period_to
    )
    if store_id:
        expenses_stmt = expenses_stmt.where(Expense.store_id == store_id)
    expenses_total = Decimal(str((await db.execute(expenses_stmt)).scalar_one() or 0))

    writeoffs_stmt = select(func.coalesce(func.sum(WriteoffInvoice.total_amount), 0)).where(
        WriteoffInvoice.status == "posted",
        WriteoffInvoice.date >= period_from,
        WriteoffInvoice.date <= period_to,
    )
    if store_id:
        writeoffs_stmt = writeoffs_stmt.where(WriteoffInvoice.store_id == store_id)
    writeoffs_total = Decimal(str((await db.execute(writeoffs_stmt)).scalar_one() or 0))

    net_profit = gross_profit - expenses_total - writeoffs_total

    return {
        "period": {"from": period_from.isoformat(), "to": period_to.isoformat()},
        "revenue": float(revenue),
        "costOfGoods": float(cost_of_goods),
        "coveredItems": covered_items,
        "totalItems": total_items,
        "grossProfit": float(gross_profit),
        "expensesTotal": float(expenses_total),
        "writeoffsTotal": float(writeoffs_total),
        "netProfit": float(net_profit),
    }


# ═══════════════════════════════ Отчёты (CSV) ═══════════════════════════════


def _csv_bytes(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return "﻿" + buf.getvalue()


async def _report_payments(db: AsyncSession, period_from: date, period_to: date) -> str:
    f, t = dt_bounds(period_from, period_to)
    stmt = (
        select(Payment, Order)
        .join(Order, Order.id == Payment.order_id)
        .where(Payment.created_at >= f, Payment.created_at <= t)
        .order_by(Payment.created_at)
    )
    rows = (await db.execute(stmt)).all()
    out = []
    for p, o in rows:
        method = p.method or ("Онлайн-оплата (Т-Банк)" if p.tbank_payment_id else "—")
        out.append([
            p.created_at.date().isoformat() if p.created_at else "",
            o.order_number or o.posiflora_doc_no or o.id,
            method,
            p.status,
            str(p.amount),
        ])
    return _csv_bytes(["Дата", "Заказ", "Способ", "Статус", "Сумма"], out)


async def _report_sales(db: AsyncSession, period_from: date, period_to: date) -> str:
    f, t = dt_bounds(period_from, period_to)
    stmt = select(Order).where(Order.created_at >= f, Order.created_at <= t).order_by(Order.created_at)
    orders = (await db.execute(stmt)).scalars().all()
    out = [
        [
            o.created_at.date().isoformat() if o.created_at else "",
            o.order_number or o.posiflora_doc_no or o.id,
            o.customer_name,
            o.status,
            str(o.total_amount),
            str(o.discount_total),
            str(o.markup_total),
        ]
        for o in orders
    ]
    return _csv_bytes(["Дата", "Заказ", "Клиент", "Статус", "Сумма", "Скидка", "Надбавка"], out)


async def _report_vendors(db: AsyncSession, period_from: date, period_to: date) -> str:
    stmt = (
        select(Vendor.title, func.count(PackingInvoice.id), func.coalesce(func.sum(PackingInvoice.total_amount), 0))
        .select_from(PackingInvoice)
        .join(Vendor, Vendor.id == PackingInvoice.vendor_id)
        .where(PackingInvoice.date >= period_from, PackingInvoice.date <= period_to)
        .group_by(Vendor.title)
        .order_by(Vendor.title)
    )
    rows = (await db.execute(stmt)).all()
    out = [[title, count, str(total)] for title, count, total in rows]
    return _csv_bytes(["Поставщик", "Накладных", "Сумма закупок за период"], out)


async def _report_goods_flow(db: AsyncSession, period_from: date, period_to: date) -> str:
    f, t = dt_bounds(period_from, period_to)

    inbound_stmt = (
        select(PackingInvoiceItem.item_id, func.coalesce(func.sum(PackingInvoiceItem.quantity), 0), func.coalesce(func.sum(PackingInvoiceItem.amount), 0))
        .select_from(PackingInvoiceItem)
        .join(PackingInvoice, PackingInvoice.id == PackingInvoiceItem.invoice_id)
        .where(PackingInvoice.date >= period_from, PackingInvoice.date <= period_to)
        .group_by(PackingInvoiceItem.item_id)
    )
    writeoff_stmt = (
        select(
            WriteoffInvoiceItem.item_id,
            func.coalesce(func.sum(WriteoffInvoiceItem.quantity), 0),
            func.coalesce(func.sum(WriteoffInvoiceItem.quantity * WriteoffInvoiceItem.cost_price), 0),
        )
        .select_from(WriteoffInvoiceItem)
        .join(WriteoffInvoice, WriteoffInvoice.id == WriteoffInvoiceItem.invoice_id)
        .where(WriteoffInvoice.date >= period_from, WriteoffInvoice.date <= period_to)
        .group_by(WriteoffInvoiceItem.item_id)
    )
    sold_stmt = (
        select(
            OrderItem.inventory_item_id,
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0),
        )
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.kind == "item", Order.created_at >= f, Order.created_at <= t)
        .group_by(OrderItem.inventory_item_id)
    )

    inbound = {iid: (qty, amt) for iid, qty, amt in (await db.execute(inbound_stmt)).all() if iid}
    written_off = {iid: (qty, amt) for iid, qty, amt in (await db.execute(writeoff_stmt)).all() if iid}
    sold = {iid: (qty, amt) for iid, qty, amt in (await db.execute(sold_stmt)).all() if iid}

    all_item_ids = set(inbound) | set(written_off) | set(sold)
    titles: dict[str, str] = {}
    categories: dict[str, str] = {}
    if all_item_ids:
        item_rows = (
            await db.execute(
                select(Item.id, Item.title, Category.title)
                .outerjoin(Category, Category.id == Item.category_id)
                .where(Item.id.in_(all_item_ids))
            )
        ).all()
        for iid, title, cat_title in item_rows:
            titles[iid] = title
            categories[iid] = cat_title or "Без категории"

    out = []
    for iid in sorted(all_item_ids, key=lambda i: titles.get(i, "")):
        in_qty, in_amt = inbound.get(iid, (0, 0))
        wo_qty, wo_amt = written_off.get(iid, (0, 0))
        sold_qty, sold_amt = sold.get(iid, (0, 0))
        out.append([
            titles.get(iid, iid),
            categories.get(iid, "Без категории"),
            str(in_qty), str(in_amt),
            str(wo_qty), str(wo_amt),
            str(sold_qty), str(sold_amt),
        ])
    return _csv_bytes(
        ["Товар", "Категория", "Приход, шт", "Приход, ₽", "Списание, шт", "Списание, ₽", "Продано, шт", "Продано, ₽"],
        out,
    )


async def _report_bouquets(db: AsyncSession, period_from: date, period_to: date) -> str:
    f, t = dt_bounds(period_from, period_to)
    stmt = (
        select(
            OrderItem.title,
            func.count(OrderItem.id),
            func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0),
        )
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.kind == "bouquet", Order.created_at >= f, Order.created_at <= t)
        .group_by(OrderItem.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
    )
    rows = (await db.execute(stmt)).all()
    out = [[title, count, str(revenue)] for title, count, revenue in rows]
    return _csv_bytes(["Букет", "Продано раз", "Выручка"], out)


_REPORT_BUILDERS = {
    "payments": _report_payments,
    "sales": _report_sales,
    "vendors": _report_vendors,
    "goods-flow": _report_goods_flow,
    "bouquets": _report_bouquets,
}


@router.get("/reports")
async def list_reports(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _paginate(qs)
    report_type = qs.get("filter[type]") or qs.get("type")
    q = (qs.get("filter[q]") or qs.get("q") or "").strip()

    stmt = select(GeneratedFile).where(GeneratedFile.kind.in_(REPORT_KINDS))
    if report_type:
        stmt = stmt.where(GeneratedFile.kind == f"report:{report_type}")
    if q:
        stmt = stmt.where(GeneratedFile.title.ilike(f"%{q}%"))

    count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(GeneratedFile.created_at.desc()).offset((number - 1) * size).limit(size))
    ).scalars().all()

    return document(
        [generated_file_resource(r) for r in rows],
        meta={"page": {"number": number, "size": size, "count": count}},
    )


@router.post("/reports", status_code=201)
async def create_report(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or body or {}
    report_type = attrs.get("type")
    if report_type not in _REPORT_BUILDERS:
        raise HTTPException(status_code=400, detail=f"type must be one of {list(_REPORT_BUILDERS)}")

    raw_from, raw_to = attrs.get("from"), attrs.get("to")
    if not raw_from or not raw_to:
        raise HTTPException(status_code=400, detail="from and to are required")
    try:
        period_from = date.fromisoformat(str(raw_from)[:10])
        period_to = date.fromisoformat(str(raw_to)[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="from/to must be ISO dates")
    if period_to < period_from:
        period_from, period_to = period_to, period_from

    content = await _REPORT_BUILDERS[report_type](db, period_from, period_to)
    row = GeneratedFile(
        kind=f"report:{report_type}",
        title=REPORT_TITLES[report_type],
        period_from=period_from,
        period_to=period_to,
        status="done",
        content=content,
        created_by_id=worker.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(generated_file_resource(row))


@router.post("/reports/{report_id}/refresh")
async def refresh_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(GeneratedFile).where(GeneratedFile.id == report_id))).scalar_one_or_none()
    if row is None or not row.kind.startswith("report:"):
        raise HTTPException(status_code=404, detail="not found")
    report_type = row.kind.split(":", 1)[1]
    if report_type not in _REPORT_BUILDERS or row.period_from is None or row.period_to is None:
        raise HTTPException(status_code=400, detail="report cannot be refreshed")

    row.content = await _REPORT_BUILDERS[report_type](db, row.period_from, row.period_to)
    row.status = "done"
    row.created_at = _now()
    await db.commit()
    await db.refresh(row)
    return document(generated_file_resource(row))


def _download_headers(row: GeneratedFile) -> dict:
    """Content-Disposition needs an ASCII-only `filename` fallback (Cyrillic
    titles aren't valid latin-1 header bytes) plus the RFC 5987 `filename*`
    so browsers still show/save the real Russian title."""
    day = row.created_at.date().isoformat() if row.created_at else "file"
    ascii_name = f"{row.kind.replace(':', '-')}-{day}.csv"
    pretty_name = f"{row.title}-{day}.csv"
    return {
        "Content-Disposition": (
            f'attachment; filename="{ascii_name}"; '
            f"filename*=UTF-8''{quote(pretty_name)}"
        )
    }


@router.get("/reports/{report_id}/download")
async def download_report(report_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(GeneratedFile).where(GeneratedFile.id == report_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    content = row.content if row.content.startswith("﻿") else "﻿" + row.content
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers=_download_headers(row),
    )


# ═══════════════════════════════ Общая история выгрузок ═══════════════════════════════


@router.get("/generated-files")
async def list_generated_files(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    number, size = _paginate(qs)
    kind = qs.get("filter[kind]") or qs.get("kind")

    stmt = select(GeneratedFile)
    if kind:
        stmt = stmt.where(GeneratedFile.kind == kind)

    count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(GeneratedFile.created_at.desc()).offset((number - 1) * size).limit(size))
    ).scalars().all()

    return document(
        [generated_file_resource(r) for r in rows],
        meta={"page": {"number": number, "size": size, "count": count}},
    )


@router.post("/generated-files", status_code=201)
async def create_generated_file(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Backs the existing customers/items CSV export route handlers
    (src/app/admin/api/customers/export, .../inventory-items/export), which
    build the CSV in Next.js and POST it here so the export shows up in the
    shared history (/admin/exports-list, /admin/items-export)."""
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or body or {}
    kind = attrs.get("kind")
    if kind not in GENERATED_FILE_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {GENERATED_FILE_KINDS}")
    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    def _opt_date(v):
        if not v:
            return None
        try:
            return date.fromisoformat(str(v)[:10])
        except ValueError:
            return None

    row = GeneratedFile(
        kind=kind,
        title=title,
        period_from=_opt_date(attrs.get("periodFrom")),
        period_to=_opt_date(attrs.get("periodTo")),
        status="done",
        content=attrs.get("content") or "",
        created_by_id=worker.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return document(generated_file_resource(row))
