"""POS-терминал (касса флориста) — /v1/pos/*.

Наш аналог приложения «Терминал» Posiflora: кассовые смены с пересчётом нала,
продажа с витрины/каталога одним запросом и внесения/изъятия. Продажа создаёт
сразу завершённый заказ: цены берутся только из каталога (bouquet.sale_amount /
розничная цена товара), источник — «Терминал» (code=terminal), платёж
CONFIRMED. Ожидаемая касса смены = opening_cash + нал-продажи смены +
внесения − изъятия; расхождения фиксируются в смене (admin-map §2.6.1).
"""

import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog_models import (
    Bouquet,
    Specification,
    SpecificationWithVariants,
)
from app.database import get_db
from app.fiscal_models import FiscalReceipt
from app.inventory_models import Item
from app.deps import get_current_worker
from app.dictionary_models import CashReason
from app.jsonapi import document
from app.models import Order, OrderItem, OrderStatusHistory, Payment
from app.serializers import order_resource, shift_resource
from app.services import aqsi
from app.services.deal_sources import SOURCE_TERMINAL, get_or_create_deal_source
from app.services.stock import apply_movement
from app.staff_models import CashOperation, Shift, Worker
from app.routers.v1_sales import (
    DEFAULT_MEASURE,
    _bouquet_component_rows,
    _current_totals,
    _dec,
    _load_order_full,
    _next_order_number,
    _recalc_total,
    _retail_price,
)

router = APIRouter(
    prefix="/v1/pos", tags=["v1-pos"], dependencies=[Depends(get_current_worker)]
)

# Статусы букета, в которых он не может быть продан с витрины (словарь статусов
# из боевых данных Posiflora: purchased = продан).
BOUQUET_UNSELLABLE_STATUSES = ("purchased", "deleted", "cancelled", "disassembled")
BOUQUET_SOLD_STATUS = "purchased"

POS_PAYMENT_METHODS = ("cash", "card")

# Маркер «наших» смен. ETL импортирует исторические смены Posiflora (свои
# device_name, часть висит незакрытой в самом источнике) — касса должна видеть
# только смены, открытые нашим терминалом, иначе брошенная Posiflora-смена
# навсегда блокирует открытие новой.
POS_DEVICE_NAME = "POS"


def _money(raw, field: str) -> Decimal:
    try:
        value = _dec(raw)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number")
    if value < 0:
        raise HTTPException(status_code=400, detail=f"{field} must be >= 0")
    return value


async def _open_shift(db: AsyncSession, store_id: str) -> Shift | None:
    return (
        await db.execute(
            select(Shift)
            .where(
                Shift.store_id == store_id,
                Shift.closed_at.is_(None),
                Shift.device_name == POS_DEVICE_NAME,
            )
            .order_by(Shift.opened_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _cash_sales_total(db: AsyncSession, shift_id: str) -> Decimal:
    """Нал, попавший в ящик за смену: платежи с payment.shift_id — продажи
    кассы и принятые ею предоплаты заказов."""
    total = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.shift_id == shift_id,
                Payment.method == "cash",
                Payment.status == "CONFIRMED",
            )
        )
    ).scalar_one()
    return _dec(total)


async def _cash_ops_total(db: AsyncSession, shift_id: str, op_type: str) -> Decimal:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(CashOperation.amount), 0)).where(
                CashOperation.shift_id == shift_id,
                CashOperation.operation_type == op_type,
            )
        )
    ).scalar_one()
    return _dec(total)


async def _expected_cash(db: AsyncSession, shift: Shift) -> Decimal:
    """Сколько нала должно быть в кассе прямо сейчас."""
    return (
        _dec(shift.opening_cash)
        + await _cash_sales_total(db, shift.id)
        + await _cash_ops_total(db, shift.id, "in")
        - await _cash_ops_total(db, shift.id, "out")
    )


async def _last_closing_cash(db: AsyncSession, store_id: str) -> Decimal:
    """Ожидаемая касса при открытии = closing_cash последней закрытой смены."""
    last = (
        await db.execute(
            select(Shift.closing_cash)
            .where(
                Shift.store_id == store_id,
                Shift.closed_at.is_not(None),
                Shift.device_name == POS_DEVICE_NAME,
            )
            .order_by(Shift.closed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return _dec(last)


async def _shift_sales(db: AsyncSession, shift_id: str) -> tuple[int, Decimal]:
    row = (
        await db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.shift_id == shift_id
            )
        )
    ).one()
    return int(row[0]), _dec(row[1])


# ---------- контекст терминала ----------


@router.get("/context")
async def pos_context(request: Request, db: AsyncSession = Depends(get_db)):
    """Состояние кассы точки: открытая смена, ожидаемый нал, продажи смены.

    Если смены нет — expectedOpeningCash для формы открытия (closing_cash
    последней закрытой смены точки, 0 для первой).
    """
    store_id = request.query_params.get("filter[store]")
    if not store_id:
        raise HTTPException(status_code=400, detail="filter[store] is required")

    shift = await _open_shift(db, store_id)
    if shift is None:
        meta = {
            "expectedOpeningCash": float(await _last_closing_cash(db, store_id)),
        }
        return document(None, meta=meta)

    sales_count, sales_total = await _shift_sales(db, shift.id)
    meta = {
        "expectedCash": float(await _expected_cash(db, shift)),
        "salesCount": sales_count,
        "salesTotal": float(sales_total),
    }
    return document(shift_resource(shift), meta=meta)


# ---------- каталог кассы ----------


@router.get("/products")
async def pos_products(request: Request, db: AsyncSession = Depends(get_db)):
    """Товарная витрина кассы одной ручкой (мобильный терминал, вкладки
    «Товары»/«Витрина»): продаваемые букеты точки (+возраст для бейджа срока
    жизни) и позиции каталога с розничной ценой и фото.
    """
    store_id = request.query_params.get("filter[store]")
    if not store_id:
        raise HTTPException(status_code=400, detail="filter[store] is required")

    bouquet_rows = (
        (
            await db.execute(
                select(Bouquet)
                .where(
                    Bouquet.store_id == store_id,
                    Bouquet.status.not_in(BOUQUET_UNSELLABLE_STATUSES),
                    Bouquet.sale_amount > 0,
                )
                .order_by(Bouquet.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    from app.catalog_models import Image

    item_rows = (
        await db.execute(
            select(Item, Image.file_small)
            .join(Image, Image.id == Item.logo_id, isouter=True)
            .where(Item.status != "deleted")
            .order_by(Item.title)
        )
    ).all()

    bouquets = [
        {
            "id": b.id,
            "title": b.title,
            "price": float(_dec(b.sale_amount)),
            "createdAt": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bouquet_rows
    ]
    items = [
        {
            "id": item.id,
            "title": item.title,
            "price": float(price),
            "photo": photo,
        }
        for item, photo in item_rows
        if (price := _retail_price(item)) is not None and price > 0
    ]
    return {"bouquets": bouquets, "items": items}


# ---------- смены ----------


@router.post("/shifts", status_code=201)
async def open_shift(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Открыть смену с пересчётом нала. Расхождение при открытии = пересчёт
    минус closing_cash последней закрытой смены точки."""
    body = await request.json() or {}
    store_id = body.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId is required")
    if await _open_shift(db, store_id) is not None:
        raise HTTPException(status_code=409, detail="Смена уже открыта на этой точке")

    counted = _money(body.get("countedCash"), "countedCash")
    expected = await _last_closing_cash(db, store_id)

    shift = Shift(
        store_id=store_id,
        # Всегда POS_DEVICE_NAME: маркер отличает наши смены от импортированных
        # из Posiflora — клиентское deviceName сломало бы этот фильтр.
        device_name=POS_DEVICE_NAME,
        opened_by_id=worker.id,
        opened_at=datetime.utcnow(),
        opening_cash=counted,
        open_discrepancy=int(counted - expected),
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return document(shift_resource(shift))


@router.post("/shifts/{shift_id}/close")
async def close_shift(
    shift_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Закрыть смену с пересчётом. Расхождение = пересчёт минус ожидаемый нал
    (opening_cash + нал-продажи + внесения − изъятия)."""
    shift = (
        await db.execute(select(Shift).where(Shift.id == shift_id))
    ).scalar_one_or_none()
    if shift is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    if shift.closed_at is not None:
        raise HTTPException(status_code=409, detail="Смена уже закрыта")

    body = await request.json() or {}
    counted = _money(body.get("countedCash"), "countedCash")
    expected = await _expected_cash(db, shift)

    shift.closing_cash = counted
    shift.close_discrepancy = int(counted - expected)
    shift.closed_by_id = worker.id
    shift.closed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(shift)
    return document(shift_resource(shift), meta={"expectedCash": float(expected)})


# ---------- внесения / изъятия ----------


@router.get("/cash-operations")
async def list_cash_operations(request: Request, db: AsyncSession = Depends(get_db)):
    shift_id = request.query_params.get("filter[shift]")
    if not shift_id:
        raise HTTPException(status_code=400, detail="filter[shift] is required")
    rows = (
        (
            await db.execute(
                select(CashOperation)
                .where(CashOperation.shift_id == shift_id)
                .order_by(CashOperation.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    data = [
        {
            "id": op.id,
            "type": "cash-operations",
            "attributes": {
                "operationType": op.operation_type,
                "reason": op.reason,
                "amount": op.amount,
                "createdAt": op.created_at.isoformat() if op.created_at else None,
            },
        }
        for op in rows
    ]
    return document(data)


@router.post("/cash-operations", status_code=201)
async def create_cash_operation(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Внесение (in) / изъятие (out) нала — требует открытой смены точки."""
    body = await request.json() or {}
    store_id = body.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId is required")
    op_type = body.get("type")
    if op_type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")
    amount = _money(body.get("amount"), "amount")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    shift = await _open_shift(db, store_id)
    if shift is None:
        raise HTTPException(status_code=409, detail="Нет открытой смены на этой точке")

    reason = (body.get("reason") or "").strip() or None
    reason_id = body.get("reasonId")
    if reason_id:
        row = (
            await db.execute(select(CashReason).where(CashReason.id == reason_id))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=400, detail="Неизвестная кассовая причина")
        reason = row.title

    if op_type == "out":
        expected = await _expected_cash(db, shift)
        if amount > expected:
            raise HTTPException(
                status_code=400,
                detail=f"Изъятие превышает ожидаемый нал в кассе ({expected} ₽)",
            )

    op = CashOperation(
        shift_id=shift.id,
        store_id=store_id,
        worker_id=worker.id,
        operation_type=op_type,
        reason=reason,
        amount=int(amount),
    )
    db.add(op)
    await db.commit()
    return document(
        {
            "id": op.id,
            "type": "cash-operations",
            "attributes": {
                "operationType": op.operation_type,
                "reason": op.reason,
                "amount": op.amount,
            },
        }
    )


# ---------- продажа ----------


@router.post("/sales", status_code=201)
async def create_sale(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Атомарная продажа терминала: сразу завершённый оплаченный заказ.

    Тело: {storeId, items: [{bouquetId} | {inventoryItemId, quantity}],
    payment: {method: cash|card, cashReceived?}, customerId?}. Цены позиций
    только серверные; проданный букет уходит в статус purchased.
    """
    body = await request.json() or {}
    store_id = body.get("storeId")
    if not store_id:
        raise HTTPException(status_code=400, detail="storeId is required")

    shift = await _open_shift(db, store_id)
    if shift is None:
        raise HTTPException(status_code=409, detail="Нет открытой смены — откройте смену")

    payment_spec = body.get("payment") or {}
    method = payment_spec.get("method")
    if method not in POS_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400, detail=f"payment.method must be one of {POS_PAYMENT_METHODS}"
        )

    raw_items = body.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=400, detail="items must be a non-empty list")

    source = await get_or_create_deal_source(db, SOURCE_TERMINAL)
    now = datetime.utcnow()

    order = Order(
        posiflora_id=None,
        posiflora_doc_no=None,
        order_number=await _next_order_number(db),
        customer_name="",
        phone="",
        address="",
        status="completed",
        payment_status="paid",
        bouquet_ids="[]",
        total_amount=0,
        store_id=store_id,
        shift_id=shift.id,
        source_id=source.id,
        customer_id=body.get("customerId"),
        created_by_id=worker.id,
        closed_by_id=worker.id,
        closed_at=now,
        delivery_type="pickup",
    )
    db.add(order)
    await db.flush()

    sold_bouquets: list[Bouquet] = []
    for raw in raw_items:
        bouquet_id = (raw or {}).get("bouquetId")
        inventory_item_id = (raw or {}).get("inventoryItemId")
        if bouquet_id:
            bouquet = (
                await db.execute(select(Bouquet).where(Bouquet.id == bouquet_id))
            ).scalar_one_or_none()
            if bouquet is None:
                raise HTTPException(status_code=400, detail="Букет не найден")
            if bouquet.status in BOUQUET_UNSELLABLE_STATUSES:
                raise HTTPException(
                    status_code=409, detail=f"Букет «{bouquet.title}» уже недоступен"
                )
            parent = OrderItem(
                order_id=order.id,
                parent_id=None,
                kind="bouquet",
                bouquet_id=bouquet.id,
                title=f"Букет - {bouquet.title}",
                unit_price=_dec(bouquet.sale_amount),
                quantity=Decimal(1),
                measure=DEFAULT_MEASURE,
            )
            db.add(parent)
            await db.flush()
            for comp in _bouquet_component_rows(bouquet, parent.id):
                db.add(comp)
            sold_bouquets.append(bouquet)
        elif inventory_item_id:
            item = (
                await db.execute(select(Item).where(Item.id == inventory_item_id))
            ).scalar_one_or_none()
            if item is None:
                raise HTTPException(status_code=400, detail="Товар не найден")
            price = _retail_price(item)
            if price is None:
                raise HTTPException(
                    status_code=400, detail=f"У товара «{item.title}» нет розничной цены"
                )
            qty = _dec((raw or {}).get("quantity") or 1)
            if qty <= 0:
                raise HTTPException(status_code=400, detail="Количество должно быть больше нуля")
            db.add(
                OrderItem(
                    order_id=order.id,
                    parent_id=None,
                    kind="item",
                    inventory_item_id=item.id,
                    title=item.title,
                    unit_price=price,
                    quantity=qty,
                    measure=DEFAULT_MEASURE,
                )
            )
            # Списание со склада точки в той же транзакции, что и продажа.
            await apply_movement(
                db,
                item_id=item.id,
                store_id=store_id,
                quantity=-qty,
                reason="sale",
                worker_id=worker.id,
                order_id=order.id,
            )
        else:
            raise HTTPException(
                status_code=400, detail="Каждая позиция — bouquetId или inventoryItemId"
            )

    await db.flush()
    await _recalc_total(db, order)
    total = _dec(order.total_amount)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Сумма продажи должна быть больше нуля")

    cash_received: Decimal | None = None
    change: Decimal | None = None
    if method == "cash" and payment_spec.get("cashReceived") is not None:
        cash_received = _money(payment_spec.get("cashReceived"), "payment.cashReceived")
        if cash_received < total:
            raise HTTPException(status_code=400, detail="Получено меньше суммы продажи")
        change = cash_received - total

    payment = Payment(
        order_id=order.id,
        tbank_payment_id=None,
        tbank_order_id=f"pos-{uuid.uuid4()}",
        amount=total,
        status="CONFIRMED",
        method=method,
        kind="payment",
        created_by_id=worker.id,
        shift_id=shift.id,
    )
    db.add(payment)

    for bouquet in sold_bouquets:
        bouquet.status = BOUQUET_SOLD_STATUS

    db.add(OrderStatusHistory(order_id=order.id, status="new", worker_id=worker.id))
    db.add(OrderStatusHistory(order_id=order.id, status="completed", worker_id=worker.id))
    await db.commit()

    # Фискализация после commit: недоступная касса не должна отменить продажу —
    # упавший чек остаётся failed и добивается повтором из UI.
    fiscal = await _fiscalize_sale(db, order, payment, worker)

    # Перечитываем заказ: server-side updated_at протух после UPDATE, а
    # коллекция payments была загружена в _recalc_total ещё до добавления
    # платежа — без refresh paymentsAmount уедет нулём.
    await db.refresh(order)
    await db.refresh(order, ["payments"])
    fresh = order
    meta: dict = {"total": float(total)}
    if change is not None:
        meta["change"] = float(change)
        meta["cashReceived"] = float(cash_received)
    meta["fiscal"] = {"id": fiscal.id, "status": fiscal.status, "error": fiscal.error}
    return document(order_resource(fresh), meta=meta)


# ---------- фискализация (aQsi) ----------


def _receipt_items(order: Order) -> list[dict]:
    """Верхнеуровневые позиции заказа → строки чека {title, unit_price, quantity}."""
    return [
        {"title": it.title, "unit_price": it.unit_price, "quantity": it.quantity}
        for it in order.items
        if it.parent_id is None
    ]


async def _fiscalize_sale(
    db: AsyncSession, order: Order, payment: Payment, worker: Worker
) -> FiscalReceipt:
    """Пробить чек продажи через aQsi; ошибки уходят в статус failed."""
    fiscal = FiscalReceipt(order_id=order.id, payment_id=payment.id)
    if not aqsi.is_enabled():
        fiscal.status = "skipped"
    else:
        await db.refresh(order, ["items"])
        try:
            body = aqsi.build_receipt_body(
                items=_receipt_items(order),
                method=payment.method or "cash",
                total=_dec(payment.amount),
                cashier_name=worker.name,
            )
            fiscal.operation_id = await aqsi.process_receipt(body)
            fiscal.status = "pending"
        except Exception as exc:  # сеть/касса/валидация — продажу не валим
            fiscal.status = "failed"
            fiscal.error = str(exc)[:500]
    db.add(fiscal)
    await db.commit()
    await db.refresh(fiscal)
    return fiscal


@router.post("/fiscal-receipts/{receipt_id}/retry")
async def retry_fiscal_receipt(
    receipt_id: str,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Повторить упавший чек (касса была недоступна в момент продажи)."""
    fiscal = (
        await db.execute(select(FiscalReceipt).where(FiscalReceipt.id == receipt_id))
    ).scalar_one_or_none()
    if fiscal is None:
        raise HTTPException(status_code=404, detail="Чек не найден")
    if fiscal.status == "registered":
        raise HTTPException(status_code=409, detail="Чек уже пробит")
    if not aqsi.is_enabled():
        raise HTTPException(status_code=409, detail="Фискализация не настроена (AQSI_*)")

    order = (
        await db.execute(
            select(Order).where(Order.id == fiscal.order_id).options(selectinload(Order.items))
        )
    ).scalar_one()
    payment = (
        await db.execute(select(Payment).where(Payment.id == fiscal.payment_id))
    ).scalar_one_or_none()

    try:
        body = aqsi.build_receipt_body(
            items=_receipt_items(order),
            method=(payment.method if payment else None) or "cash",
            total=_dec(payment.amount if payment else order.total_amount),
            cashier_name=worker.name,
        )
        fiscal.operation_id = await aqsi.process_receipt(body)
        fiscal.status = "pending"
        fiscal.error = None
    except Exception as exc:
        fiscal.status = "failed"
        fiscal.error = str(exc)[:500]
    await db.commit()
    await db.refresh(fiscal)
    return {
        "data": {
            "id": fiscal.id,
            "type": "fiscal-receipts",
            "attributes": {"status": fiscal.status, "error": fiscal.error},
        }
    }


# ---------- сборка букета по рецепту («Собрать букет») ----------


def _swv_price_for_store(swv: SpecificationWithVariants, store_id: str) -> int | None:
    """Цена варианта для точки: override точки -> общая цена. NULL price_value
    у строки-override означает «по цене состава» — состав пока не считаем,
    падаем на общую цену."""
    store_row = next((p for p in swv.prices if p.store_id == store_id and p.status == "on"), None)
    if store_row is not None and store_row.price_value:
        return store_row.price_value
    default_row = next((p for p in swv.prices if p.store_id is None and p.status == "on"), None)
    if default_row is not None and default_row.price_value:
        return default_row.price_value
    return None


def _swv_option(swv: SpecificationWithVariants, store_id: str) -> dict | None:
    price = _swv_price_for_store(swv, store_id)
    if price is None:
        return None
    spec_title = swv.specification.title if swv.specification else "Рецепт"
    variant_title = swv.variant.title if swv.variant else None
    return {
        "id": swv.id,
        "type": "pos-recipes",
        "attributes": {"title": spec_title, "variant": variant_title, "price": price},
    }


@router.get("/recipes")
async def list_recipes(request: Request, db: AsyncSession = Depends(get_db)):
    """Рецепты с ценой для точки — выбор в модале «Собрать букет»."""
    store_id = request.query_params.get("filter[store]")
    if not store_id:
        raise HTTPException(status_code=400, detail="filter[store] is required")

    swvs = (
        (
            await db.execute(
                select(SpecificationWithVariants)
                .where(SpecificationWithVariants.status == "on")
                .options(
                    selectinload(SpecificationWithVariants.specification),
                    selectinload(SpecificationWithVariants.variant),
                    selectinload(SpecificationWithVariants.prices),
                )
            )
        )
        .scalars()
        .all()
    )
    data = [row for row in (_swv_option(s, store_id) for s in swvs) if row]
    data.sort(key=lambda r: (r["attributes"]["title"], r["attributes"]["price"]))
    return document(data, meta={"total": len(data)})


@router.post("/bouquets", status_code=201)
async def assemble_bouquet(
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Собрать букет по рецепту: {storeId, swvId} — букет на витрине.

    Цена — серверная (цена варианта для точки). Если у варианта заполнен
    состав (specification_compositions) — компоненты списываются со склада
    writeoff-движениями; пустой состав просто ничего не списывает.
    """
    body = await request.json() or {}
    store_id = body.get("storeId")
    swv_id = body.get("swvId")
    if not store_id or not swv_id:
        raise HTTPException(status_code=400, detail="storeId и swvId обязательны")

    swv = (
        await db.execute(
            select(SpecificationWithVariants)
            .where(SpecificationWithVariants.id == swv_id)
            .options(
                selectinload(SpecificationWithVariants.specification),
                selectinload(SpecificationWithVariants.variant),
                selectinload(SpecificationWithVariants.prices),
                selectinload(SpecificationWithVariants.compositions),
            )
        )
    ).scalar_one_or_none()
    if swv is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    price = _swv_price_for_store(swv, store_id)
    if price is None:
        raise HTTPException(status_code=400, detail="У рецепта нет цены для этой точки")

    spec_title = swv.specification.title if swv.specification else "Рецепт"
    variant_suffix = f" ({swv.variant.title})" if swv.variant else ""
    bouquet = Bouquet(
        title=f"{spec_title}{variant_suffix}",
        status="window",
        amount=price,
        sale_amount=price,
        store_id=store_id,
        spec_with_variants_id=swv.id,
    )
    db.add(bouquet)
    await db.flush()

    # Списание компонентов рецепта (если состав заполнен).
    for comp in swv.compositions:
        qty = _dec(comp.quantity)
        if qty > 0:
            await apply_movement(
                db,
                item_id=comp.item_id,
                store_id=store_id,
                quantity=-qty,
                reason="writeoff",
                worker_id=worker.id,
                source_kind="bouquet",
                source_id=bouquet.id,
            )

    await db.commit()
    await db.refresh(bouquet)
    return document(
        {
            "id": bouquet.id,
            "type": "bouquets",
            "attributes": {
                "title": bouquet.title,
                "saleAmount": float(_dec(bouquet.sale_amount)),
                "status": bouquet.status,
            },
        }
    )


# ---------- предоплата заказа из кассы ----------


@router.post("/orders/{order_id}/payments", status_code=201)
async def pos_order_payment(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """Принять оплату по заказу в кассе: {method: cash|card, amount?}.

    Требует открытой смены точки заказа — нал попадает в ожидаемую кассу
    (payments.shift_id). Без amount закрывает всю сумму «К оплате». Полная
    оплата переводит payment_status в paid. Чек — аванс (54-ФЗ, признак
    расчёта «аванс»); недоступная касса оплату не блокирует.
    """
    order = await _load_order_full(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    store_id = order.store_id
    if not store_id:
        raise HTTPException(status_code=409, detail="У заказа нет торговой точки")
    shift = await _open_shift(db, store_id)
    if shift is None:
        raise HTTPException(status_code=409, detail="Нет открытой смены — откройте смену")

    body = await request.json() or {}
    method = body.get("method")
    if method not in POS_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400, detail=f"method must be one of {POS_PAYMENT_METHODS}"
        )

    totals = _current_totals(order)
    to_pay = _dec(totals["toPay"])
    if to_pay <= 0:
        raise HTTPException(status_code=409, detail="Заказ уже оплачен")

    amount = to_pay if body.get("amount") is None else _money(body.get("amount"), "amount")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")
    if amount > to_pay:
        raise HTTPException(status_code=400, detail="Сумма превышает сумму к оплате")

    payment = Payment(
        order_id=order.id,
        tbank_payment_id=None,
        tbank_order_id=f"pos-adv-{uuid.uuid4()}",
        amount=amount,
        status="CONFIRMED",
        method=method,
        kind="advance",
        created_by_id=worker.id,
        shift_id=shift.id,
    )
    db.add(payment)
    if amount == to_pay:
        order.payment_status = "paid"
    await db.commit()
    await db.refresh(payment)

    # Фискальный чек аванса — оплата принята даже при недоступной кассе.
    doc_no = order.posiflora_doc_no or (
        str(order.order_number) if order.order_number is not None else order.id[:8]
    )
    fiscal = FiscalReceipt(order_id=order.id, payment_id=payment.id)
    if not aqsi.is_enabled():
        fiscal.status = "skipped"
    else:
        try:
            fiscal_body = aqsi.build_receipt_body(
                items=[{
                    "title": f"Аванс по заказу N {doc_no}",
                    "unit_price": amount,
                    "quantity": 1,
                }],
                method=method,
                total=amount,
                cashier_name=worker.name,
                calculation_type_id=aqsi.CALCULATION_TYPE_ADVANCE,
                calculation_subject_id=aqsi.CALCULATION_SUBJECT_PAYMENT,
            )
            fiscal.operation_id = await aqsi.process_receipt(fiscal_body)
            fiscal.status = "pending"
        except Exception as exc:
            fiscal.status = "failed"
            fiscal.error = str(exc)[:500]
    db.add(fiscal)
    await db.commit()
    await db.refresh(fiscal)

    remaining = to_pay - amount
    return {
        "data": {
            "id": payment.id,
            "type": "order-payments",
            "attributes": {"amount": float(amount), "method": method},
        },
        "meta": {
            "remaining": float(remaining),
            "paid": remaining == 0,
            "fiscal": {"id": fiscal.id, "status": fiscal.status, "error": fiscal.error},
        },
    }
