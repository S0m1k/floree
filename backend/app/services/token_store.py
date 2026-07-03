"""Refresh-token store: opaque tokens kept server-side so they can be rotated
and revoked (access tokens stay stateless JWTs).

Redis is used when `settings.redis_url` is set; otherwise an in-process dict is
used — fine for dev/tests, but it does not survive restarts or span workers.
"""

import time
import uuid
from typing import Protocol

from app.config import settings


def _new_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


class RefreshTokenStore(Protocol):
    async def issue(self, worker_id: str, ttl_seconds: int) -> str: ...
    async def consume(self, token: str) -> str | None: ...
    async def revoke(self, token: str) -> None: ...


class MemoryRefreshTokenStore:
    """Dev/test store. Not shared across processes; lost on restart."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float]] = {}

    async def issue(self, worker_id: str, ttl_seconds: int) -> str:
        token = _new_token()
        self._data[token] = (worker_id, time.time() + ttl_seconds)
        return token

    async def consume(self, token: str) -> str | None:
        entry = self._data.pop(token, None)
        if entry is None:
            return None
        worker_id, expires_at = entry
        if time.time() > expires_at:
            return None
        return worker_id

    async def revoke(self, token: str) -> None:
        self._data.pop(token, None)


class RedisRefreshTokenStore:
    """Redis-backed store. `consume` is atomic (GETDEL) so a refresh token can
    be used exactly once (rotation)."""

    _PREFIX = "refresh:"

    def __init__(self, url: str) -> None:
        import redis.asyncio as redis  # imported lazily so redis isn't required

        self._redis = redis.from_url(url, decode_responses=True)

    async def issue(self, worker_id: str, ttl_seconds: int) -> str:
        token = _new_token()
        await self._redis.set(self._PREFIX + token, worker_id, ex=ttl_seconds)
        return token

    async def consume(self, token: str) -> str | None:
        # GETDEL is atomic: whoever deletes it first is the only consumer.
        return await self._redis.getdel(self._PREFIX + token)

    async def revoke(self, token: str) -> None:
        await self._redis.delete(self._PREFIX + token)


_store: RefreshTokenStore | None = None


def get_token_store() -> RefreshTokenStore:
    """Process-wide singleton chosen from config."""
    global _store
    if _store is None:
        _store = (
            RedisRefreshTokenStore(settings.redis_url)
            if settings.redis_url
            else MemoryRefreshTokenStore()
        )
    return _store
