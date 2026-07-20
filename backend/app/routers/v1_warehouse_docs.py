"""Phase 2 — Posiflora-compatible /v1 warehouse document endpoints.

Six documents, one uniform pattern: a paginated list of headers and a by-id
detail that includes the line items — plus (this phase) the write side that
turns «Учёт и финансы → Склад» from read-only into a working workflow:
create a draft, edit a draft, «Провести» (post — applies the stock-balance
side effects), delete a draft. Routes for all four write verbs are, like the
read side above, registered from a small per-type registry instead of six
near-identical route functions.

Money/quantity invariant: the client sends only item ids + quantities (and,
for packing invoices only, the incoming purchase price — that's the
supplier's price, which is genuinely a user input). Every derived number —
line amounts, `total_amount` / `financial_result` / `cost`, and the cost
basis used for write-offs/markdowns/movements/sorting — is computed
server-side from `StockBalance.cost_price`, never trusted from the request
body.
"""

from dataclasses import dataclass
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation
from typing import Callable

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.jsonapi import document
from app.catalog_models import Store
from app.inventory_models import (
    Item,
    Vendor,
    Warehouse,
    StockBalance,
    PackingInvoice,
    PackingInvoiceItem,
    WriteoffInvoice,
    WriteoffInvoiceItem,
    MarkdownAct,
    MarkdownActItem,
    SortingAct,
    SortingActItem,
    InventoryAct,
    InventoryActItem,
    MovementAct,
    MovementActItem,
)
from app.staff_models import Worker
from app import serializers_docs as sd

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-warehouse-docs"], dependencies=[Depends(get_current_worker)]
)

# ==========================================================================
# Read side (list + detail) — unchanged
# ==========================================================================

# (url path, model, header serializer, line serializer)
_DOCS = [
    ("packing-invoices", PackingInvoice, sd.packing_invoice_resource, sd.packing_invoice_line_resource),
    ("write-off-invoices", WriteoffInvoice, sd.writeoff_invoice_resource, sd.writeoff_invoice_line_resource),
    ("markdown-acts", MarkdownAct, sd.markdown_act_resource, sd.markdown_act_line_resource),
    ("sorting-acts", SortingAct, sd.sorting_act_resource, sd.sorting_act_line_resource),
    ("inventory-acts", InventoryAct, sd.inventory_act_resource, sd.inventory_act_line_resource),
    ("movement-acts", MovementAct, sd.movement_act_resource, sd.movement_act_line_resource),
]


def _page(qs) -> tuple[int, int]:
    try:
        return int(qs.get("page[number]", 1)), int(qs.get("page[size]", 200))
    except (TypeError, ValueError):
        return 1, 200


def _make_list(model, header):
    async def handler(request: Request, db: AsyncSession = Depends(get_db)):
        qs = request.query_params
        number, size = _page(qs)
        base = select(model)
        store = qs.get("filter[store]")
        if store is not None and hasattr(model, "store_id"):
            base = base.where(model.store_id == store)
        total = (
            await db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        rows = (
            await db.execute(
                base.order_by(model.created_at.desc())
                .offset((number - 1) * size)
                .limit(size)
            )
        ).scalars().all()
        data = [header(r) for r in rows]
        return document(data, meta={"page": {"number": number, "size": size}, "total": total})

    return handler


def _make_detail(model, header, line_ser):
    async def handler(doc_id: str, db: AsyncSession = Depends(get_db)):
        stmt = select(model).where(model.id == doc_id).options(selectinload(model.lines))
        doc = (await db.execute(stmt)).scalar_one_or_none()
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        included = [line_ser(l) for l in doc.lines]
        return document(header(doc, doc.lines), included=included)

    return handler


for _path, _model, _header, _line in _DOCS:
    router.add_api_route(f"/{_path}", _make_list(_model, _header), methods=["GET"], name=f"list_{_path}")
    router.add_api_route(
        f"/{_path}/{{doc_id}}", _make_detail(_model, _header, _line), methods=["GET"], name=f"get_{_path}"
    )


# ==========================================================================
# Write side — create draft / edit draft / post / delete draft
# ==========================================================================


@dataclass(frozen=True)
class DocKind:
    path: str
    model: type
    line_model: type
    header_ser: Callable
    line_ser: Callable
    prefix: str          # doc_no prefix, e.g. "ПН-"
    kind: str             # packing | writeoff | markdown | sorting | inventory | movement
    date_field: str        # header column holding the doc date
    posted_date_field: str | None  # header column holding the posting date, if any
    worker_field: str      # header column recording the author ('worker_id' | 'author_id')
    amount_field: str | None       # header column for the computed total, if any
    line_fk_field: str     # FK column on the line model pointing back at the header


_KINDS: list[DocKind] = [
    DocKind(
        "packing-invoices", PackingInvoice, PackingInvoiceItem,
        sd.packing_invoice_resource, sd.packing_invoice_line_resource,
        "ПН-", "packing", "date", None, "worker_id", "total_amount", "invoice_id",
    ),
    DocKind(
        "write-off-invoices", WriteoffInvoice, WriteoffInvoiceItem,
        sd.writeoff_invoice_resource, sd.writeoff_invoice_line_resource,
        "СП-", "writeoff", "date", None, "worker_id", "total_amount", "invoice_id",
    ),
    DocKind(
        "markdown-acts", MarkdownAct, MarkdownActItem,
        sd.markdown_act_resource, sd.markdown_act_line_resource,
        "УЦ-", "markdown", "created_date", "posted_date", "author_id", None, "act_id",
    ),
    DocKind(
        "sorting-acts", SortingAct, SortingActItem,
        sd.sorting_act_resource, sd.sorting_act_line_resource,
        "ПС-", "sorting", "created_date", "posted_date", "author_id", None, "act_id",
    ),
    DocKind(
        "inventory-acts", InventoryAct, InventoryActItem,
        sd.inventory_act_resource, sd.inventory_act_line_resource,
        "ИНВ-", "inventory", "act_date", "posted_date", "worker_id", "financial_result", "act_id",
    ),
    DocKind(
        "movement-acts", MovementAct, MovementActItem,
        sd.movement_act_resource, sd.movement_act_line_resource,
        "ПМ-", "movement", "date", None, "worker_id", "cost", "act_id",
    ),
]

REASON_MAX = 255


def _D(value) -> Decimal:
    """Coerce an already-stored model value (float/Decimal/int/None) to Decimal."""
    if value is None:
        return Decimal(0)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _dec(value, *, field: str) -> Decimal:
    """Parse a client-supplied number. Raises 400 on missing/invalid input."""
    if value is None:
        raise HTTPException(status_code=400, detail=f"{field} is required")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number")


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


def _parse_date(value) -> date_cls:
    if not value:
        return date_cls.today()
    try:
        return date_cls.fromisoformat(str(value))
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be an ISO date (YYYY-MM-DD)")


async def _validate_store(db: AsyncSession, store_id: str | None, *, field: str = "store") -> str:
    if not store_id:
        raise HTTPException(status_code=400, detail=f"{field} relationship is required")
    exists = (await db.execute(select(Store.id).where(Store.id == store_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail=f"{field} not found")
    return store_id


async def _validate_vendor(db: AsyncSession, vendor_id: str | None) -> str:
    if not vendor_id:
        raise HTTPException(status_code=400, detail="vendor relationship is required")
    exists = (await db.execute(select(Vendor.id).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="vendor not found")
    return vendor_id


async def _resolve_items(db: AsyncSession, item_ids: set[str]) -> dict[str, Item]:
    if not item_ids:
        return {}
    rows = (await db.execute(select(Item).where(Item.id.in_(item_ids)))).scalars().all()
    found = {i.id: i for i in rows}
    missing = item_ids - set(found)
    if missing:
        raise HTTPException(status_code=400, detail=f"item(s) not found: {', '.join(sorted(missing))}")
    return found


async def _get_or_create_warehouse(db: AsyncSession, store_id: str) -> Warehouse:
    wh = (
        await db.execute(select(Warehouse).where(Warehouse.store_id == store_id))
    ).scalars().first()
    if wh is not None:
        return wh
    wh = Warehouse(title="Основной склад", store_id=store_id)
    db.add(wh)
    await db.flush()
    return wh


async def _get_or_create_stock_balance(db: AsyncSession, warehouse_id: str, item_id: str) -> StockBalance:
    sb = (
        await db.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == warehouse_id, StockBalance.item_id == item_id
            )
        )
    ).scalar_one_or_none()
    if sb is not None:
        return sb
    sb = StockBalance(warehouse_id=warehouse_id, item_id=item_id, quantity=0, reserve=0, cost_price=0)
    db.add(sb)
    await db.flush()
    return sb


async def _next_doc_no(db: AsyncSession, model, prefix: str) -> str:
    rows = (await db.execute(select(model.doc_no).where(model.doc_no.isnot(None)))).scalars().all()
    max_n = 0
    for doc_no in rows:
        if doc_no and doc_no.startswith(prefix):
            suffix = doc_no[len(prefix):]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
    return f"{prefix}{max_n + 1:05d}"


def _row_dict(row) -> dict:
    if not isinstance(row, dict):
        raise HTTPException(status_code=400, detail="Each line must be an object")
    return row


async def _parse_lines(
    kind: DocKind,
    db: AsyncSession,
    raw_lines,
    *,
    warehouse_id: str | None = None,
    from_warehouse_id: str | None = None,
) -> tuple[list[dict], Decimal | None]:
    """Validate + build per-line kwargs (sans the doc FK) for `kind`.

    Returns (line_kwargs_list, header_amount) — header_amount is None for doc
    types with no header amount column (markdown/sorting acts). Prices and
    cost bases are never read from the client except packing-invoice `price`
    (the supplier's incoming price) — everything else comes from
    `StockBalance.cost_price` / `Item.max_price`.
    """
    if not isinstance(raw_lines, list) or not raw_lines:
        raise HTTPException(status_code=400, detail="at least one line item is required")

    rows = [_row_dict(r) for r in raw_lines]

    if kind.kind == "sorting":
        item_ids = {r.get("itemFromId") for r in rows} | {r.get("itemToId") for r in rows}
    else:
        item_ids = {r.get("itemId") for r in rows}
    item_ids.discard(None)
    items_by_id = await _resolve_items(db, item_ids)

    parsed: list[dict] = []
    total = Decimal(0)

    for row in rows:
        if kind.kind == "packing":
            item_id = row.get("itemId")
            if not item_id:
                raise HTTPException(status_code=400, detail="itemId is required")
            qty = _dec(row.get("quantity"), field="quantity")
            if qty <= 0:
                raise HTTPException(status_code=400, detail="quantity must be greater than 0")
            price = _dec(row.get("price"), field="price")
            if price < 0:
                raise HTTPException(status_code=400, detail="price must be >= 0")
            amount = _money(qty * price)
            parsed.append({"item_id": item_id, "quantity": qty, "price": price, "amount": amount})
            total += amount

        elif kind.kind == "writeoff":
            item_id = row.get("itemId")
            if not item_id:
                raise HTTPException(status_code=400, detail="itemId is required")
            qty = _dec(row.get("quantity"), field="quantity")
            if qty <= 0:
                raise HTTPException(status_code=400, detail="quantity must be greater than 0")
            sb = await _get_or_create_stock_balance(db, warehouse_id, item_id)
            cost_price = _D(sb.cost_price)
            parsed.append({"item_id": item_id, "quantity": qty, "cost_price": cost_price})
            total += _money(qty * cost_price)

        elif kind.kind == "markdown":
            item_id = row.get("itemId")
            if not item_id:
                raise HTTPException(status_code=400, detail="itemId is required")
            qty = _dec(row.get("quantity"), field="quantity")
            if qty <= 0:
                raise HTTPException(status_code=400, detail="quantity must be greater than 0")
            new_price = _dec(row.get("newPrice"), field="newPrice")
            if new_price < 0:
                raise HTTPException(status_code=400, detail="newPrice must be >= 0")
            item = items_by_id[item_id]
            old_price = _D(item.max_price)
            parsed.append({
                "item_id": item_id, "quantity": qty, "old_price": old_price, "new_price": new_price,
            })

        elif kind.kind == "sorting":
            item_from_id = row.get("itemFromId")
            item_to_id = row.get("itemToId")
            if not item_from_id or not item_to_id:
                raise HTTPException(status_code=400, detail="itemFromId and itemToId are required")
            if item_from_id == item_to_id:
                raise HTTPException(status_code=400, detail="itemFromId and itemToId must differ")
            qty = _dec(row.get("quantity"), field="quantity")
            if qty <= 0:
                raise HTTPException(status_code=400, detail="quantity must be greater than 0")
            parsed.append({"item_from_id": item_from_id, "item_to_id": item_to_id, "quantity": qty})

        elif kind.kind == "inventory":
            item_id = row.get("itemId")
            if not item_id:
                raise HTTPException(status_code=400, detail="itemId is required")
            raw_actual = row.get("actualQty", row.get("quantity"))
            actual_qty = _dec(raw_actual, field="actualQty")
            if actual_qty < 0:
                raise HTTPException(status_code=400, detail="actualQty must be >= 0")
            sb = await _get_or_create_stock_balance(db, warehouse_id, item_id)
            expected_qty = _D(sb.quantity)
            diff_amount = _money((actual_qty - expected_qty) * _D(sb.cost_price))
            parsed.append({"item_id": item_id, "expected_qty": expected_qty, "actual_qty": actual_qty})
            total += diff_amount

        elif kind.kind == "movement":
            item_id = row.get("itemId")
            if not item_id:
                raise HTTPException(status_code=400, detail="itemId is required")
            qty = _dec(row.get("quantity"), field="quantity")
            if qty <= 0:
                raise HTTPException(status_code=400, detail="quantity must be greater than 0")
            sb = await _get_or_create_stock_balance(db, from_warehouse_id, item_id)
            cost_price = _D(sb.cost_price)
            parsed.append({"item_id": item_id, "quantity": qty, "cost_price": cost_price})
            total += _money(qty * cost_price)

    has_amount = kind.amount_field is not None
    return parsed, (_money(total) if has_amount else None)


async def _load_doc(db: AsyncSession, kind: DocKind, doc_id: str):
    stmt = select(kind.model).where(kind.model.id == doc_id).options(selectinload(kind.model.lines))
    return (await db.execute(stmt)).scalar_one_or_none()


def _doc_response(kind: DocKind, doc) -> dict:
    lines = list(doc.lines)
    included = [kind.line_ser(l) for l in lines]
    return document(kind.header_ser(doc, lines), included=included)


def _extract_body_lines(body: dict, data: dict):
    raw_lines = body.get("lines") if isinstance(body, dict) else None
    if not isinstance(raw_lines, list):
        raw_lines = data.get("lines") if isinstance(data, dict) else None
    return raw_lines


# ---------- create ----------


def _make_create(kind: DocKind):
    async def handler(
        request: Request,
        db: AsyncSession = Depends(get_db),
        worker: Worker = Depends(get_current_worker),
    ):
        body = await request.json()
        data = (body or {}).get("data") or {}
        attrs = data.get("attributes") or {}
        rels = data.get("relationships") or {}
        raw_lines = _extract_body_lines(body or {}, data)

        header_kwargs: dict = {
            "doc_no": await _next_doc_no(db, kind.model, kind.prefix),
            kind.date_field: _parse_date(attrs.get("date")),
            "status": "draft",
            kind.worker_field: worker.id,
        }

        warehouse_id = None
        from_warehouse_id = None

        if kind.kind == "movement":
            from_store = await _validate_store(db, _rel_id(rels, "fromStore"), field="fromStore")
            to_store = await _validate_store(db, _rel_id(rels, "toStore"), field="toStore")
            if from_store == to_store:
                raise HTTPException(status_code=400, detail="fromStore and toStore must differ")
            header_kwargs["from_store_id"] = from_store
            header_kwargs["to_store_id"] = to_store
            from_wh = await _get_or_create_warehouse(db, from_store)
            from_warehouse_id = from_wh.id
        else:
            store_id = await _validate_store(db, _rel_id(rels, "store"))
            header_kwargs["store_id"] = store_id
            if kind.kind in ("writeoff", "markdown", "inventory"):
                wh = await _get_or_create_warehouse(db, store_id)
                warehouse_id = wh.id

        if kind.kind == "packing":
            vendor_id = await _validate_vendor(db, _rel_id(rels, "vendor"))
            header_kwargs["vendor_id"] = vendor_id
            header_kwargs["payment_amount"] = 0

        if kind.kind == "writeoff":
            reason = attrs.get("reason") or _rel_id(rels, "reason")
            reason = (str(reason).strip() if reason else None) or None
            if reason and len(reason) > REASON_MAX:
                raise HTTPException(status_code=400, detail=f"reason exceeds {REASON_MAX} characters")
            header_kwargs["reason"] = reason

        parsed_lines, amount = await _parse_lines(
            kind, db, raw_lines, warehouse_id=warehouse_id, from_warehouse_id=from_warehouse_id
        )
        header_kwargs["items_count"] = len(parsed_lines)
        if kind.amount_field is not None:
            header_kwargs[kind.amount_field] = amount

        doc = kind.model(**header_kwargs)
        db.add(doc)
        await db.flush()
        for line_kwargs in parsed_lines:
            db.add(kind.line_model(**{kind.line_fk_field: doc.id, **line_kwargs}))
        await db.commit()

        fresh = await _load_doc(db, kind, doc.id)
        return _doc_response(kind, fresh)

    return handler


# ---------- update (draft only) ----------


def _make_update(kind: DocKind):
    async def handler(doc_id: str, request: Request, db: AsyncSession = Depends(get_db)):
        doc = await _load_doc(db, kind, doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if doc.status == "posted":
            raise HTTPException(status_code=409, detail="Document is posted and cannot be edited")

        body = await request.json()
        data = (body or {}).get("data") or {}
        attrs = data.get("attributes") or {}
        rels = data.get("relationships") or {}
        raw_lines = _extract_body_lines(body or {}, data)

        if "date" in attrs:
            setattr(doc, kind.date_field, _parse_date(attrs.get("date")))

        if kind.kind == "movement":
            if "fromStore" in rels:
                doc.from_store_id = await _validate_store(db, _rel_id(rels, "fromStore"), field="fromStore")
            if "toStore" in rels:
                doc.to_store_id = await _validate_store(db, _rel_id(rels, "toStore"), field="toStore")
            if doc.from_store_id == doc.to_store_id:
                raise HTTPException(status_code=400, detail="fromStore and toStore must differ")
        else:
            if "store" in rels:
                doc.store_id = await _validate_store(db, _rel_id(rels, "store"))

        if kind.kind == "packing" and "vendor" in rels:
            doc.vendor_id = await _validate_vendor(db, _rel_id(rels, "vendor"))

        if kind.kind == "writeoff" and ("reason" in attrs or "reason" in rels):
            reason = attrs.get("reason") or _rel_id(rels, "reason")
            reason = (str(reason).strip() if reason else None) or None
            if reason and len(reason) > REASON_MAX:
                raise HTTPException(status_code=400, detail=f"reason exceeds {REASON_MAX} characters")
            doc.reason = reason

        if raw_lines is not None:
            warehouse_id = None
            from_warehouse_id = None
            if kind.kind == "movement":
                from_wh = await _get_or_create_warehouse(db, doc.from_store_id)
                from_warehouse_id = from_wh.id
            elif kind.kind in ("writeoff", "markdown", "inventory"):
                wh = await _get_or_create_warehouse(db, doc.store_id)
                warehouse_id = wh.id

            for line in list(doc.lines):
                await db.delete(line)
            await db.flush()

            parsed_lines, amount = await _parse_lines(
                kind, db, raw_lines, warehouse_id=warehouse_id, from_warehouse_id=from_warehouse_id
            )
            doc.items_count = len(parsed_lines)
            if kind.amount_field is not None:
                setattr(doc, kind.amount_field, amount)
            for line_kwargs in parsed_lines:
                db.add(kind.line_model(**{kind.line_fk_field: doc.id, **line_kwargs}))

        await db.commit()
        fresh = await _load_doc(db, kind, doc.id)
        return _doc_response(kind, fresh)

    return handler


# ---------- post («Провести») ----------


def _make_post(kind: DocKind):
    async def handler(doc_id: str, db: AsyncSession = Depends(get_db)):
        doc = await _load_doc(db, kind, doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if doc.status == "posted":
            raise HTTPException(status_code=409, detail="Document is already posted")

        lines = list(doc.lines)

        if kind.kind == "packing":
            wh = await _get_or_create_warehouse(db, doc.store_id)
            for line in lines:
                sb = await _get_or_create_stock_balance(db, wh.id, line.item_id)
                sb.quantity = _D(sb.quantity) + _D(line.quantity)
                sb.cost_price = _D(line.price)

        elif kind.kind in ("writeoff", "markdown"):
            wh = await _get_or_create_warehouse(db, doc.store_id)
            for line in lines:
                sb = await _get_or_create_stock_balance(db, wh.id, line.item_id)
                sb.quantity = _D(sb.quantity) - _D(line.quantity)

        elif kind.kind == "sorting":
            wh = await _get_or_create_warehouse(db, doc.store_id)
            for line in lines:
                from_sb = await _get_or_create_stock_balance(db, wh.id, line.item_from_id)
                from_sb.quantity = _D(from_sb.quantity) - _D(line.quantity)
                to_sb = await _get_or_create_stock_balance(db, wh.id, line.item_to_id)
                to_sb.quantity = _D(to_sb.quantity) + _D(line.quantity)

        elif kind.kind == "inventory":
            wh = await _get_or_create_warehouse(db, doc.store_id)
            total = Decimal(0)
            for line in lines:
                sb = await _get_or_create_stock_balance(db, wh.id, line.item_id)
                total += _money((_D(line.actual_qty) - _D(line.expected_qty)) * _D(sb.cost_price))
                sb.quantity = _D(line.actual_qty)
            doc.financial_result = _money(total)

        elif kind.kind == "movement":
            from_wh = await _get_or_create_warehouse(db, doc.from_store_id)
            to_wh = await _get_or_create_warehouse(db, doc.to_store_id)
            for line in lines:
                from_sb = await _get_or_create_stock_balance(db, from_wh.id, line.item_id)
                from_sb.quantity = _D(from_sb.quantity) - _D(line.quantity)
                to_sb = await _get_or_create_stock_balance(db, to_wh.id, line.item_id)
                to_sb.quantity = _D(to_sb.quantity) + _D(line.quantity)
                to_sb.cost_price = _D(line.cost_price)

        doc.status = "posted"
        if kind.posted_date_field:
            setattr(doc, kind.posted_date_field, date_cls.today())

        await db.commit()
        fresh = await _load_doc(db, kind, doc.id)
        return _doc_response(kind, fresh)

    return handler


# ---------- delete (draft only) ----------


def _make_delete(kind: DocKind):
    async def handler(doc_id: str, db: AsyncSession = Depends(get_db)):
        doc = await _load_doc(db, kind, doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if doc.status == "posted":
            raise HTTPException(status_code=409, detail="Document is posted and cannot be deleted")
        for line in list(doc.lines):
            await db.delete(line)
        await db.delete(doc)
        await db.commit()
        return Response(status_code=204)

    return handler


for _kind in _KINDS:
    router.add_api_route(
        f"/{_kind.path}", _make_create(_kind), methods=["POST"], status_code=201, name=f"create_{_kind.path}"
    )
    router.add_api_route(
        f"/{_kind.path}/{{doc_id}}", _make_update(_kind), methods=["PATCH"], name=f"update_{_kind.path}"
    )
    router.add_api_route(
        f"/{_kind.path}/{{doc_id}}/post", _make_post(_kind), methods=["POST"], name=f"post_{_kind.path}"
    )
    router.add_api_route(
        f"/{_kind.path}/{{doc_id}}",
        _make_delete(_kind),
        methods=["DELETE"],
        status_code=204,
        name=f"delete_{_kind.path}",
    )
