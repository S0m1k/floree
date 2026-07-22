"""Складские остатки — /v1/stock/* (admin «Обзор склада», admin-map §2.4.1).

Остатки ведутся нашим журналом движений (services/stock.py): продажа POS
списывает, инвентаризация выправляет. GET отдаёт снэпшот по товарам точки
с деньгами (остаток × себестоимость / розница); POST /inventory принимает
пересчитанные количества, создаёт акт инвентаризации и correction-движения
до фактических значений.
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog_models import Store
from app.database import get_db
from app.deps import get_current_worker
from app.inventory_models import InventoryAct, InventoryActItem, Item, StockBalance, Warehouse
from app.services.stock import apply_movement, get_or_create_warehouse
from app.staff_models import Worker

router = APIRouter(
    prefix="/v1/stock", tags=["v1-stock"], dependencies=[Depends(get_current_worker)]
)


def _dec(value) -> Decimal:
    if value is None:
        return Decimal(0)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(0)


def _qty(value) -> float:
    """Количество наружу: целые без хвоста, дробные как есть."""
    d = _dec(value)
    return float(d)


@router.get("")
async def stock_overview(request: Request, db: AsyncSession = Depends(get_db)):
    """Остатки точки по товарам: строки для таблицы «Обзор склада».

    Товары со статусом deleted и услуги не показываются; нулевые остатки
    включаются (их выправляет инвентаризация), фильтр filter[nonzero]=1
    оставляет только ненулевые.
    """
    qs = request.query_params
    store_id = qs.get("filter[store]")
    if not store_id:
        raise HTTPException(status_code=400, detail="filter[store] is required")

    base = (
        select(Item, StockBalance.quantity, StockBalance.cost_price)
        .outerjoin(
            StockBalance,
            (StockBalance.item_id == Item.id)
            & StockBalance.warehouse_id.in_(
                select(Warehouse.id).where(Warehouse.store_id == store_id)
            ),
        )
        .where(Item.status != "deleted", Item.item_type == "item")
        .order_by(Item.title)
    )
    q = (qs.get("q") or "").strip()
    if q:
        base = base.where(Item.title.ilike(f"%{q}%"))
    category = qs.get("filter[category]")
    if category:
        base = base.where(Item.category_id == category)

    rows = (await db.execute(base)).all()
    if qs.get("filter[nonzero]") in ("1", "true"):
        rows = [r for r in rows if _dec(r[1]) != 0]

    data = []
    totals = {"qty": Decimal(0), "costSum": Decimal(0), "retailSum": Decimal(0)}
    for item, quantity, cost_price in rows:
        qty = _dec(quantity)
        cost = _dec(cost_price)
        retail = _dec(item.max_price or item.min_price)
        totals["qty"] += qty
        totals["costSum"] += qty * cost
        totals["retailSum"] += qty * retail
        data.append(
            {
                "id": item.id,
                "type": "stock-rows",
                "attributes": {
                    "title": item.title,
                    "quantity": _qty(qty),
                    "costPrice": float(cost),
                    "costSum": float(qty * cost),
                    "retailPrice": float(retail),
                    "retailSum": float(qty * retail),
                },
            }
        )

    return {
        "data": data,
        "meta": {
            "total": len(data),
            "totals": {k: float(v) for k, v in totals.items()},
        },
    }


@router.post("/inventory", status_code=201)
async def post_inventory(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Инвентаризация: {storeId, lines: [{itemId, actualQty}]}.

    На каждую позицию пишется correction-движение (факт − снэпшот), создаётся
    проведённый акт инвентаризации с ожидаемым/фактическим количеством.
    Финрезультат акта — по розничным ценам расхождений.
    """
    body = await request.json() or {}
    store_id = body.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId is required")
    store = (await db.execute(select(Store).where(Store.id == store_id))).scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=400, detail="store not found")

    raw_lines = body.get("lines")
    if not isinstance(raw_lines, list) or not raw_lines:
        raise HTTPException(status_code=400, detail="lines must be a non-empty list")

    warehouse = await get_or_create_warehouse(db, store_id)

    act = InventoryAct(
        doc_no=None,
        act_date=date.today(),
        posted_date=date.today(),
        store_id=store_id,
        worker_id=worker.id,
        status="posted",
    )
    db.add(act)
    await db.flush()

    financial_result = Decimal(0)
    lines_count = 0
    for raw in raw_lines:
        item_id = (raw or {}).get("itemId")
        if not item_id:
            raise HTTPException(status_code=400, detail="Каждая строка — itemId и actualQty")
        item = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=400, detail=f"Товар {item_id} не найден")
        try:
            actual = Decimal(str((raw or {}).get("actualQty")))
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"actualQty должно быть числом ({item.title})")
        if actual < 0:
            raise HTTPException(status_code=400, detail=f"actualQty не может быть меньше нуля ({item.title})")

        expected = (
            await db.execute(
                select(StockBalance.quantity).where(
                    StockBalance.warehouse_id == warehouse.id,
                    StockBalance.item_id == item_id,
                )
            )
        ).scalar_one_or_none()
        expected = _dec(expected)

        db.add(InventoryActItem(
            act_id=act.id, item_id=item_id, expected_qty=expected, actual_qty=actual,
        ))
        lines_count += 1

        diff = actual - expected
        if diff != 0:
            await apply_movement(
                db,
                item_id=item_id,
                store_id=store_id,
                quantity=diff,
                reason="inventory",
                worker_id=worker.id,
                source_kind="inventory-act",
                source_id=act.id,
            )
            financial_result += diff * _dec(item.max_price or item.min_price)

    act.items_count = lines_count
    act.financial_result = financial_result
    await db.commit()
    await db.refresh(act)
    return {
        "data": {
            "id": act.id,
            "type": "inventory-acts",
            "attributes": {
                "itemsCount": act.items_count,
                "financialResult": float(act.financial_result),
                "status": act.status,
            },
        }
    }
