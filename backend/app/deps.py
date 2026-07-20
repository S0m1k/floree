"""Shared FastAPI dependencies (auth)."""

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth import decode_access_token
from app.staff_models import Worker


async def get_current_worker(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Worker:
    """Resolve the Bearer access token to an active Worker, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    worker_id = decode_access_token(token)
    if worker_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    worker = (
        await db.execute(select(Worker).where(Worker.id == worker_id))
    ).scalar_one_or_none()
    if worker is None or worker.status != "active":
        raise HTTPException(status_code=401, detail="Worker not found or inactive")
    return worker
