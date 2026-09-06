"""Delivery of storefront events into the vendor Posiflora.

While CATALOG_SOURCE=posiflora the florists work in the vendor CRM, so
everything the storefront produces has to arrive THERE — a row that exists
only in our own DB is invisible to the people assembling bouquets.

Two mechanisms live here:

* `fulfill_order_in_posiflora` — push a just-paid order (create + record the
  payment). Called from the payment webhooks.
* `run_push_retry_loop` — a background loop that re-pushes paid orders whose
  Posiflora delivery failed earlier (vendor outage, expired session, network).
  Without it a failed push was logged once and lost forever: the buyer had
  paid, our CRM had the order, and the florists never saw it.
"""

import asyncio
import json

from sqlalchemy import select

from app.config import use_posiflora
from app.models import Order
from app.services.posiflora import create_order as posiflora_create_order
from app.services.posiflora import record_payment

RETRY_INTERVAL_SECONDS = 300  # 5 min — vendor outages are minutes, not ms


async def fulfill_order_in_posiflora(order: Order, amount_rubles: float) -> None:
    """Hand a just-paid order to the vendor Posiflora (CATALOG_SOURCE=posiflora).

    Creates the Posiflora order from the payload stashed at checkout — once,
    guarded by `posiflora_id` — and records the payment against it, so the
    florist sees a paid order in their own system.

    In `local` mode this is a no-op: the order is already fulfilled in our CRM.

    Never raises. The money has been taken by the time we get here, so a
    Posiflora outage must not turn into a failed webhook (which the provider
    would retry, and which would leave the buyer looking at an error). A
    failure leaves `posiflora_id` empty and the retry loop picks it up.
    """
    if not use_posiflora():
        return

    if order.posiflora_id is None and order.order_payload:
        try:
            args = json.loads(order.order_payload)
            pf_resp = await posiflora_create_order(**args)
            order.posiflora_id = pf_resp["data"]["id"]
            order.posiflora_doc_no = (
                pf_resp["data"]["attributes"].get("docNo") or order.posiflora_doc_no
            )
        except Exception as e:
            print(f"[Posiflora] Deferred order creation failed: {e}")

    if order.posiflora_id:
        try:
            await record_payment(order.posiflora_id, amount_rubles)
        except Exception as e:
            print(f"[Posiflora] Record payment failed: {e}")


def _unpushed_orders_query():
    """Paid orders that never reached Posiflora and still can be rebuilt."""
    return select(Order).where(
        Order.payment_status == "paid",
        Order.posiflora_id.is_(None),
        Order.order_payload.is_not(None),
    )


async def retry_unpushed_orders() -> int:
    """Re-push every paid-but-undelivered order. Returns how many made it."""
    if not use_posiflora():
        return 0

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        rows = await db.execute(_unpushed_orders_query())
        stuck = rows.scalars().all()
        pushed = 0
        for order in stuck:
            await fulfill_order_in_posiflora(order, float(order.total_amount))
            if order.posiflora_id:
                pushed += 1
        await db.commit()
        return pushed


async def run_push_retry_loop(stop_event: asyncio.Event) -> None:
    """Background loop: first pass immediately (catches orders stuck from
    before a restart), then every RETRY_INTERVAL_SECONDS until shutdown."""
    while not stop_event.is_set():
        try:
            pushed = await retry_unpushed_orders()
            if pushed:
                print(f"[Posiflora] Retry loop delivered {pushed} stuck order(s)")
        except Exception as e:
            print(f"[Posiflora] Retry loop error: {e}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=RETRY_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue
