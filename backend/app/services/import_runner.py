"""One-click Posiflora import: admin-managed credentials, background run,
progress journal, and local photo download.

The heavy lifting is backend/app/etl/posiflora_import.py (idempotent merges);
this module wraps it with DB-stored credentials, an ImportRun journal row the
admin UI polls, and a final step that downloads every referenced image to our
server and rewrites URLs — so nothing on the storefront points at Posiflora's
CDN once the client's subscription ends.
"""

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.catalog_models import Image
from app.dictionary_models import ImportRun, PosifloraSettings
from app.services import posiflora
from app.services.tls import outbound_ssl_context

# Where downloaded photos live; served by FastAPI at /media (see app.main).
MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", Path(__file__).resolve().parent.parent.parent / "media"))

# Public origin the storefront uses in <img> URLs (absolute so next/image works).
_PUBLIC_BASE = (os.environ.get("FRONTEND_URL") or settings.frontend_url).rstrip("/")

_IMAGE_FIELDS = ("file", "file_small", "file_medium", "file_shop")

_run_lock = asyncio.Lock()
_running = False


async def get_or_create_posiflora_settings(db: AsyncSession) -> PosifloraSettings:
    row = (
        await db.execute(
            select(PosifloraSettings).where(
                PosifloraSettings.id == PosifloraSettings.SINGLETON_ID
            )
        )
    ).scalar_one_or_none()
    if row is None:
        # First read seeds floree's own credentials from .env so the shop's
        # import works out of the box; other installs fill the form manually.
        row = PosifloraSettings(
            id=PosifloraSettings.SINGLETON_ID,
            base_url=settings.posiflora_base_url,
            username=settings.posiflora_username,
            password=settings.posiflora_password,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def is_import_running() -> bool:
    return _running


async def _download_images(session: AsyncSession, log) -> tuple[int, int]:
    """Download remote image files locally; rewrite rows to our /media URLs.

    Returns (downloaded_files, updated_rows). Already-local rows are skipped,
    so re-runs only fetch what's new.
    """
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    rows = (await session.execute(select(Image))).scalars().all()
    prefix = f"{_PUBLIC_BASE}/media/"
    downloaded = updated = 0

    async with httpx.AsyncClient(
        timeout=60, verify=outbound_ssl_context(), follow_redirects=True
    ) as client:
        for img in rows:
            changed = False
            for field in _IMAGE_FIELDS:
                url = getattr(img, field)
                if not url or not url.startswith("http") or url.startswith(prefix):
                    continue
                ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
                fname = f"{img.id}-{field}{ext}"
                dest = MEDIA_DIR / fname
                if not dest.exists():
                    try:
                        resp = await client.get(url)
                        if resp.status_code != 200 or not resp.content:
                            continue
                        dest.write_bytes(resp.content)
                        downloaded += 1
                    except httpx.HTTPError:
                        continue  # оставляем старый URL, докачаем в следующий раз
                setattr(img, field, f"{prefix}{fname}")
                changed = True
            if changed:
                updated += 1
        await session.commit()
    log(f"фото: скачано файлов {downloaded}, обновлено записей {updated}")
    return downloaded, updated


async def run_import(run_id: str) -> None:
    """Background task body: full ETL + photo download, journaled to ImportRun."""
    global _running
    from app.etl import posiflora_import as etl

    lines: list[str] = []

    async def flush(status: str | None = None, error: str | None = None):
        async with AsyncSessionLocal() as jdb:
            run = (
                await jdb.execute(select(ImportRun).where(ImportRun.id == run_id))
            ).scalar_one()
            run.log = "\n".join(lines)
            if status:
                run.status = status
                run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
            if error:
                run.error = error
            await jdb.commit()

    def log(msg: str):
        lines.append(msg)

    async with _run_lock:
        _running = True
    try:
        # Credentials: admin-managed row (seeded from .env for floree).
        async with AsyncSessionLocal() as db:
            creds = await get_or_create_posiflora_settings(db)
        if not (creds.base_url and creds.username and creds.password):
            raise RuntimeError("Не заполнены доступы Posiflora (адрес/логин/пароль)")
        posiflora.set_credentials(creds.base_url, creds.username, creds.password)

        async with AsyncSessionLocal() as session:
            log(f"магазины: {await etl.import_stores(session)}")
            await flush()
            log(f"категории: {await etl.import_categories(session)}")
            log(f"товары (+ед.изм., фото): {await etl.import_items(session)}")
            await flush()
            log(f"поставщики: {await etl.import_vendors(session)}")
            log(f"сотрудники: {await etl.import_workers(session)}")
            log(f"смены: {await etl.import_shifts(session)}")
            await flush()
            log(f"рецепты (+варианты, цены): {await etl.import_specifications(session)}")
            await flush()
            log(f"букеты: {await etl.import_bouquets(session)}")
            log(f"клиенты: {await etl.import_customers(session)}")
            log(f"справочники: {await etl.import_dictionaries(session)}")
            await flush()
            log(f"заказы: {await etl.import_orders(session)}")
            log(f"платежи заказов: {await etl.import_order_payments(session)}")
            await flush()
            orders_ok, lines_created = await etl.import_order_lines(session)
            log(f"строки заказов: {orders_ok} заказов, {lines_created} строк")
            log(f"складские документы: {await etl.import_warehouse_docs(session)}")
            await flush()
            await _download_images(session, log)

        log("готово")
        await flush(status="done")
    except Exception as e:  # noqa: BLE001 — журналируем любую причину падения
        log(f"ОШИБКА: {e}")
        await flush(status="error", error=str(e))
    finally:
        async with _run_lock:
            _running = False


async def start_import() -> str:
    """Create the journal row and launch the background task. Returns run id."""
    global _running
    async with _run_lock:
        if _running:
            raise RuntimeError("Импорт уже выполняется")
        _running = True  # держим флаг до старта таска, чтобы не было гонки
    try:
        async with AsyncSessionLocal() as db:
            run = ImportRun(status="running", log="запуск…")
            db.add(run)
            await db.commit()
            await db.refresh(run)
        asyncio.create_task(run_import(run.id))
        return run.id
    except Exception:
        async with _run_lock:
            _running = False
        raise
