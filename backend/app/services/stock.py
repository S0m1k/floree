"""Складские остатки — движения и материализованный снэпшот.

Единственная точка записи остатков: `apply_movement` добавляет строку в
журнал stock_movements и синхронно обновляет StockBalance (снэпшот, который
читают «Обзор склада» и аналитика себестоимости). Остаток может уходить в
минус — продажа в магазине не должна упираться в неточный учёт; минус виден
на экране остатков и выправляется инвентаризацией.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog_models import Store
from app.inventory_models import StockBalance, StockMovement, Warehouse


async def get_or_create_warehouse(db: AsyncSession, store_id: str) -> Warehouse:
    """Склад точки — одна строка на store, создаётся лениво."""
    warehouse = (
        await db.execute(select(Warehouse).where(Warehouse.store_id == store_id).limit(1))
    ).scalar_one_or_none()
    if warehouse is not None:
        return warehouse

    store = (
        await db.execute(select(Store).where(Store.id == store_id))
    ).scalar_one_or_none()
    title = f"Склад «{store.title}»" if store else "Склад точки"
    warehouse = Warehouse(title=title, store_id=store_id)
    db.add(warehouse)
    await db.flush()
    return warehouse


async def apply_movement(
    db: AsyncSession,
    *,
    item_id: str,
    store_id: str,
    quantity: Decimal,
    reason: str,
    worker_id: str | None = None,
    order_id: str | None = None,
    source_kind: str | None = None,
    source_id: str | None = None,
    cost_price: Decimal | None = None,
) -> StockMovement:
    """Записать движение (+приход/−расход) и обновить снэпшот остатка.

    Не коммитит — транзакцией владеет вызывающий код (движение продажи должно
    падать/применяться вместе с самой продажей).
    """
    warehouse = await get_or_create_warehouse(db, store_id)

    movement = StockMovement(
        item_id=item_id,
        warehouse_id=warehouse.id,
        quantity=quantity,
        reason=reason,
        worker_id=worker_id,
        order_id=order_id,
        source_kind=source_kind,
        source_id=source_id,
        cost_price=cost_price,
    )
    db.add(movement)

    balance = (
        await db.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == warehouse.id,
                StockBalance.item_id == item_id,
            )
        )
    ).scalar_one_or_none()
    if balance is None:
        balance = StockBalance(warehouse_id=warehouse.id, item_id=item_id, quantity=0)
        db.add(balance)
    balance.quantity = Decimal(str(balance.quantity or 0)) + quantity
    if cost_price is not None:
        balance.cost_price = cost_price
    await db.flush()
    return movement


async def get_balance(db: AsyncSession, item_id: str, store_id: str) -> Decimal:
    row = (
        await db.execute(
            select(StockBalance.quantity)
            .join(Warehouse, Warehouse.id == StockBalance.warehouse_id)
            .where(Warehouse.store_id == store_id, StockBalance.item_id == item_id)
        )
    ).scalar_one_or_none()
    return Decimal(str(row)) if row is not None else Decimal(0)
