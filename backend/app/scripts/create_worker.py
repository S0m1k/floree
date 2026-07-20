"""Seed / update an admin Worker so someone can actually log in to /admin.

Usage:
    python -m app.scripts.create_worker <login> <password> [--name "Имя"]

Idempotent: if a Worker with the given login already exists, its password
(and name, when --name is passed) is updated in place instead of creating a
duplicate. The Worker is always left `active` so it can authenticate.
"""

import argparse
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.services.auth import hash_password
from app.staff_models import Worker


async def upsert_worker(login: str, password: str, name: str | None) -> tuple[str, bool]:
    """Create or update the Worker for `login`. Returns (worker_id, created)."""
    async with AsyncSessionLocal() as db:
        worker = (
            await db.execute(select(Worker).where(Worker.login == login))
        ).scalar_one_or_none()

        created = worker is None
        if worker is None:
            worker = Worker(name=name or login, login=login)
            db.add(worker)
        elif name is not None:
            worker.name = name

        worker.password_hash = hash_password(password)
        worker.status = "active"

        await db.commit()
        await db.refresh(worker)
        return worker.id, created


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update an admin Worker.")
    parser.add_argument("login", help="Login used on /admin/login")
    parser.add_argument("password", help="Plaintext password (bcrypt-hashed before storage)")
    parser.add_argument("--name", default=None, help="Display name (defaults to the login)")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    worker_id, created = asyncio.run(upsert_worker(args.login, args.password, args.name))
    verb = "Created" if created else "Updated"
    print(f"{verb} worker '{args.login}' (id={worker_id})")


if __name__ == "__main__":
    main()
