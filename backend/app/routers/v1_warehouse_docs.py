"""Phase 2 — Posiflora-compatible /v1 warehouse document endpoints.

Six documents, one uniform pattern: a paginated list of headers and a by-id
detail that includes the line items. Routes are registered from a registry.
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.jsonapi import document
from app.inventory_models import (
    PackingInvoice,
    WriteoffInvoice,
    MarkdownAct,
    SortingAct,
    InventoryAct,
    MovementAct,
)
from app import serializers_docs as sd

router = APIRouter(prefix="/v1", tags=["v1-warehouse-docs"])

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
