"""Test harness: an in-memory SQLite DB wired into the ASGI app.

Environment variables required by `app.config.Settings` are set here — before
any `app.*` import — so importing the app never fails for lack of a real
Postgres/Posiflora/T-Bank configuration.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-key")
os.environ.setdefault("POSIFLORA_BASE_URL", "http://posiflora.test")
os.environ.setdefault("POSIFLORA_USERNAME", "unused")
os.environ.setdefault("POSIFLORA_PASSWORD", "unused")
os.environ.setdefault("POSIFLORA_STORE_ID", "store")
os.environ.setdefault("POSIFLORA_SOURCE_ID", "source")
os.environ.setdefault("TBANK_TERMINAL_KEY", "unused")
os.environ.setdefault("TBANK_SECRET_KEY", "unused")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Import every model module so Base.metadata knows all tables before create_all.
import app.catalog_models  # noqa: F401
import app.dictionary_models  # noqa: F401
import app.finance_models  # noqa: F401
import app.fiscal_models  # noqa: F401
import app.inventory_models  # noqa: F401
import app.loyalty_models  # noqa: F401
import app.models  # noqa: F401
import app.staff_models  # noqa: F401
from app.database import Base, get_db
from app.main import app
from app.services.auth import hash_password
from app.staff_models import Worker

# One shared in-memory connection (StaticPool) so the schema survives across
# sessions within a test.
_engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(_engine, expire_on_commit=False)


async def _override_get_db():
    async with TestingSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


@pytest_asyncio.fixture
async def client():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def worker_token(client):
    """Seed an active worker and return a valid access token for it."""
    async with TestingSessionLocal() as db:
        db.add(
            Worker(
                name="Test Admin",
                login="admin",
                password_hash=hash_password("secret123"),
                status="active",
            )
        )
        await db.commit()

    resp = await client.post(
        "/api/v1/sessions",
        json={"data": {"type": "sessions", "attributes": {"username": "admin", "password": "secret123"}}},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["attributes"]["accessToken"]
