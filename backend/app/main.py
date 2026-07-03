from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import (
    recipes,
    orders,
    payments,
    v1_catalog,
    v1_sales,
    v1_dictionaries,
    v1_inventory,
    v1_warehouse_docs,
    v1_sessions,
)

app = FastAPI(title="Floree API")

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
# Phase 2 — Posiflora-compatible /api/v1/* endpoints served from our own DB.
app.include_router(v1_catalog.router, prefix="/api")
app.include_router(v1_sales.router, prefix="/api")
app.include_router(v1_dictionaries.router, prefix="/api")
app.include_router(v1_inventory.router, prefix="/api")
app.include_router(v1_warehouse_docs.router, prefix="/api")
app.include_router(v1_sessions.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
