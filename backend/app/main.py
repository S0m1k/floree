from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import recipes, orders, payments, callbacks
import app.models  # noqa: F401 — register models in Base.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all is additive-only: it creates missing tables (e.g. new
    # callback_requests) and never alters or drops existing ones. The repo
    # carries no alembic migrations, so this is the schema source of truth.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


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


@app.get("/health")
async def health():
    return {"status": "ok"}
