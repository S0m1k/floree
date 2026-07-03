"""Auth primitives: password hashing (bcrypt) and stateless access-token JWTs.

Refresh tokens are handled separately by app.services.token_store.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings


def _pw_bytes(password: str) -> bytes:
    # bcrypt hard-caps input at 72 bytes; truncate consistently.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(worker_id: str) -> tuple[str, str]:
    """Return (jwt, expire_at_iso). HS256, `sub` = worker id."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=settings.access_token_ttl_seconds)
    payload = {"sub": worker_id, "iat": int(now.timestamp()), "exp": int(expire.timestamp())}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expire.isoformat()


def decode_access_token(token: str) -> str | None:
    """Return the worker id (`sub`) or None if the token is invalid/expired."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")
