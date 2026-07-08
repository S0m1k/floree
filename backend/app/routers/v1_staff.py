"""Phase 4 — Posiflora-compatible /v1 endpoints for staff (workers).

Minimal read-only listing so the admin "Заказы" filter panel can populate its
КЕМ СОЗДАН / ФЛОРИСТ / КЕМ ЗАКРЫТ selects (docs/posiflora/admin-map.md §2.2).
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.staff_models import Worker
from app.jsonapi import document
from app.serializers import worker_resource

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-staff"], dependencies=[Depends(get_current_worker)]
)


@router.get("/workers")
async def list_workers(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    try:
        number, size = int(qs.get("page[number]", 1)), int(qs.get("page[size]", 200))
    except (TypeError, ValueError):
        number, size = 1, 200
    base = select(Worker)
    store_id = qs.get("filter[store]")
    if store_id:
        base = base.where(Worker.store_id == store_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(base.offset((number - 1) * size).limit(size))
    ).scalars().all()
    data = [worker_resource(w) for w in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


@router.get("/workers/{worker_id}")
async def get_worker(worker_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return document(worker_resource(row))
