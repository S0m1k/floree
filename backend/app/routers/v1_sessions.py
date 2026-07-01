"""Phase 2 — Posiflora-compatible /v1/sessions (JWT auth).

POST /v1/sessions handles both login (username+password) and refresh
(refreshToken). Access tokens are stateless HS256 JWTs; refresh tokens are
opaque, stored server-side (Redis) and rotated on every use.

Session resource attributes match what the existing clients read:
accessToken, expireAt, refreshToken (+ refreshExpireAt).
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.jsonapi import document, resource, rel_one
from app.staff_models import Worker
from app.services.auth import create_access_token, verify_password
from app.services.token_store import get_token_store
from app.config import settings
from app.deps import get_current_worker

router = APIRouter(prefix="/v1", tags=["v1-sessions"])


def _refresh_expire_iso() -> str:
    return (
        datetime.now(timezone.utc)
        + timedelta(seconds=settings.refresh_token_ttl_seconds)
    ).isoformat()


async def _issue_session(worker_id: str) -> dict:
    access, expire_at = create_access_token(worker_id)
    refresh = await get_token_store().issue(worker_id, settings.refresh_token_ttl_seconds)
    attrs = {
        "accessToken": access,
        "expireAt": expire_at,
        "refreshToken": refresh,
        "refreshExpireAt": _refresh_expire_iso(),
    }
    rels = {"worker": rel_one("workers", worker_id)}
    return document(resource("sessions", uuid.uuid4().hex, attrs, rels))


@router.post("/sessions")
async def create_session(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}

    # Refresh flow: rotate the presented refresh token for a new session.
    refresh_token = attrs.get("refreshToken")
    if refresh_token:
        worker_id = await get_token_store().consume(refresh_token)
        if worker_id is None:
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        return await _issue_session(worker_id)

    # Login flow: verify username + password.
    username = attrs.get("username")
    password = attrs.get("password")
    if not username or not password:
        raise HTTPException(status_code=422, detail="username and password required")

    worker = (
        await db.execute(select(Worker).where(Worker.login == username))
    ).scalar_one_or_none()
    if (
        worker is None
        or worker.status != "active"
        or not verify_password(password, worker.password_hash)
    ):
        # Same message either way — don't reveal which part failed.
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return await _issue_session(worker.id)


@router.delete("/sessions")
async def delete_session(request: Request):
    """Logout — revoke the presented refresh token (idempotent)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    attrs = ((body or {}).get("data") or {}).get("attributes") or {}
    token = attrs.get("refreshToken")
    if token:
        await get_token_store().revoke(token)
    return Response(status_code=204)


@router.get("/sessions/current")
async def current_session(worker: Worker = Depends(get_current_worker)):
    """Return the authenticated worker (clone extension; handy for the SPA)."""
    attrs = {
        "name": worker.name,
        "login": worker.login,
        "status": worker.status,
    }
    rels = {
        "role": rel_one("roles", worker.role_id),
        "store": rel_one("stores", worker.store_id),
    }
    return document(resource("workers", worker.id, attrs, rels))
