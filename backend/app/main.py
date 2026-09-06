from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import (
    recipes,
    orders,
    payments,
    callbacks,
    promo,
    v1_catalog,
    v1_sales,
    v1_customers,
    v1_dictionaries,
    v1_inventory,
    v1_warehouse_docs,
    v1_sessions,
    v1_staff,
    v1_analytics,
    v1_loyalty,
    v1_finance,
    v1_shop,
    v1_imports,
    v1_pos,
    v1_stock,
)
import app.models  # noqa: F401 — register models in Base.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all is additive-only: it creates missing tables (e.g. new
    # callback_requests) and never alters or drops existing ones. The repo
    # carries no alembic migrations, so this is the schema source of truth.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed launch promo codes (insert-if-missing; admin edits are never touched).
    from app.database import AsyncSessionLocal
    from app.services.promo import seed_default_codes
    async with AsyncSessionLocal() as db:
        await seed_default_codes(db)
    # In posiflora mode, paid orders whose push to the vendor failed (outage,
    # expired session) are re-delivered in the background — see posiflora_push.
    import asyncio
    from app.config import use_posiflora
    from app.services.posiflora_push import run_push_retry_loop
    stop_event = asyncio.Event()
    retry_task = (
        asyncio.create_task(run_push_retry_loop(stop_event))
        if use_posiflora()
        else None
    )
    yield
    if retry_task is not None:
        stop_event.set()
        await retry_task


app = FastAPI(title="Floree API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recipes.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(callbacks.router, prefix="/api")
app.include_router(promo.router, prefix="/api")
# Phase 2 — Posiflora-compatible /api/v1/* endpoints served from our own DB.
app.include_router(v1_catalog.router, prefix="/api")
app.include_router(v1_sales.router, prefix="/api")
app.include_router(v1_customers.router, prefix="/api")
app.include_router(v1_dictionaries.router, prefix="/api")
app.include_router(v1_inventory.router, prefix="/api")
app.include_router(v1_warehouse_docs.router, prefix="/api")
app.include_router(v1_sessions.router, prefix="/api")
app.include_router(v1_staff.router, prefix="/api")
app.include_router(v1_analytics.router, prefix="/api")
app.include_router(v1_loyalty.router, prefix="/api")
app.include_router(v1_finance.router, prefix="/api")
app.include_router(v1_shop.router, prefix="/api")
app.include_router(v1_imports.router, prefix="/api")
app.include_router(v1_pos.router, prefix="/api")
app.include_router(v1_stock.router, prefix="/api")


# Локальное хранилище фото каталога (заполняется импортом из Posiflora).
from app.services.import_runner import MEDIA_DIR  # noqa: E402
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


@app.get("/health")
async def health():
    return {"status": "ok"}
