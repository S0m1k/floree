"""Импорт клиентов и номенклатуры из файла (admin-map §2.5.3, «Импорт клиентов» /
admin/customers/import; по мотивам §2.3.7 — «Импорт» /admin/catalog/import для
товаров/услуг вместо вендорского справочника Posiflora).

Двухшаговый флоу, общий для обеих сущностей (`customers` | `items`):
  1. POST /v1/imports/{entity}/preview — загрузка файла (.xlsx/.csv),
     возвращает первые строки + автоматически угаданное сопоставление
     колонка→поле + fileToken, по которому загруженный файл можно запустить
     на импорт вторым шагом.
  2. POST /v1/imports/{entity}/run — повторный разбор сохранённого файла с
     подтверждённым маппингом: валидация, дедупликация, создание строк.
  3. GET /v1/imports/{entity}/template — CSV-пример для кнопки «Скачать пример».

Загруженные файлы лежат во временном каталоге сервера
(tempfile.gettempdir()/floree_imports) под uuid-именем; файлы старше суток
подчищаются при каждом вызове preview — никакой отдельной cron-очистки не
требуется для этого объёма.
"""

import csv
import io
import re
import tempfile
import time
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Category, Customer
from app.inventory_models import Item
from app.deps import get_current_worker
from app.routers.v1_customers import _normalize_phone

try:
    import openpyxl
except ImportError:  # pragma: no cover — optional at import time, checked at use
    openpyxl = None

router = APIRouter(
    prefix="/v1", tags=["v1-imports"], dependencies=[Depends(get_current_worker)]
)

ENTITIES = ("customers", "items")
PREVIEW_ROWS = 20
MAX_ROWS = 10000
MAX_ERRORS = 50
UPLOAD_DIR = Path(tempfile.gettempdir()) / "floree_imports"
FILE_MAX_AGE_SECONDS = 24 * 60 * 60

_TOKEN_RE = re.compile(r"^[0-9a-fA-F-]{8,36}$")


def _validate_entity(entity: str) -> None:
    if entity not in ENTITIES:
        raise HTTPException(status_code=404, detail=f"Unknown import entity: {entity}")


# ---------- upload storage ----------


def _cleanup_old_files() -> None:
    if not UPLOAD_DIR.exists():
        return
    cutoff = time.time() - FILE_MAX_AGE_SECONDS
    for f in UPLOAD_DIR.iterdir():
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


def _save_upload(token: str, filename: str, content: bytes) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(filename or "").suffix.lower()
    if ext not in (".csv", ".xlsx"):
        ext = ".xlsx" if content[:2] == b"PK" else ".csv"
    path = UPLOAD_DIR / f"{token}{ext}"
    path.write_bytes(content)
    return path


def _find_upload(token: str) -> Path | None:
    if not token or not _TOKEN_RE.match(token):
        return None
    for ext in (".csv", ".xlsx"):
        p = UPLOAD_DIR / f"{token}{ext}"
        if p.exists():
            return p
    return None


# ---------- file parsing ----------


def _decode_csv_bytes(content: bytes) -> str:
    """utf-8 / utf-8-sig (BOM) first; cp1251 (classic Excel-on-Windows export
    encoding) as the fallback heuristic when the bytes aren't valid utf-8."""
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1251")


def _read_csv_rows(path: Path) -> list[list]:
    text = _decode_csv_bytes(path.read_bytes())
    sample = text[:2048]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
    return list(csv.reader(io.StringIO(text), delimiter=delimiter))


def _read_xlsx_rows(path: Path) -> list[list]:
    if openpyxl is None:  # pragma: no cover — always installed in this project
        raise HTTPException(status_code=400, detail="Поддержка .xlsx недоступна на сервере")
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    rows = [["" if v is None else v for v in row] for row in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def _read_rows(path: Path) -> list[list]:
    if path.suffix == ".xlsx":
        return _read_xlsx_rows(path)
    return _read_csv_rows(path)


def _cell_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _get(row: list, idx) -> object:
    """Raw cell value at a mapped column index, or None if unmapped/out of range."""
    if idx is None:
        return None
    try:
        i = int(idx)
    except (TypeError, ValueError):
        return None
    if i < 0 or i >= len(row):
        return None
    return row[i]


def _row_is_blank(row: list) -> bool:
    return not any(_cell_str(v).strip() for v in row)


# ---------- column labels + auto-guessed mapping ----------


def _column_labels(first_row: list) -> list[str]:
    labels = []
    for i, v in enumerate(first_row):
        text = _cell_str(v).strip()
        labels.append(text if text else f"Колонка {i + 1}")
    return labels


_CUSTOMER_FIELD_KEYWORDS = {
    "name": ("имя", "фио", "name", "клиент", "фамилия"),
    "phone": ("телефон", "phone", "тел"),
    "birthday": ("рождения", "birthday", "  др "),
    "email": ("email", "e-mail", "почта"),
    "comment": ("коммент", "примечан", "comment", "заметк"),
}

_ITEM_FIELD_KEYWORDS = {
    "title": ("название", "наименование", "title", "товар", "номенклатур"),
    "max_price": ("цена", "price", "стоимость"),
    "barcode": ("штрихкод", "штрих-код", "barcode", "ean"),
    "category": ("категория", "category", "группа"),
}


def _suggest_mapping(entity: str, labels: list[str]) -> dict[str, int]:
    keywords = _CUSTOMER_FIELD_KEYWORDS if entity == "customers" else _ITEM_FIELD_KEYWORDS
    mapping: dict[str, int] = {}
    used_cols: set[int] = set()
    for field, kws in keywords.items():
        for i, label in enumerate(labels):
            if i in used_cols:
                continue
            low = label.lower()
            if any(kw.strip() in low for kw in kws):
                mapping[field] = i
                used_cols.add(i)
                break
    return mapping


# ---------- POST /v1/imports/{entity}/preview ----------


@router.post("/imports/{entity}/preview")
async def preview_import(entity: str, file: UploadFile = File(...)):
    _validate_entity(entity)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    _cleanup_old_files()
    token = str(uuid.uuid4())
    path = _save_upload(token, file.filename or "", content)

    try:
        rows = _read_rows(path)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Не удалось прочитать файл — проверьте формат")

    if not rows:
        raise HTTPException(status_code=400, detail="Файл не содержит строк")

    str_rows = [[_cell_str(v) for v in row] for row in rows]
    columns = _column_labels(str_rows[0])
    suggested = _suggest_mapping(entity, columns)

    return {
        "fileToken": token,
        "columns": columns,
        "rows": str_rows[:PREVIEW_ROWS],
        "suggestedMapping": suggested,
    }


# ---------- POST /v1/imports/{entity}/run ----------


def _parse_birthday_cell(value) -> tuple[date | None, str | None]:
    if value in (None, ""):
        return None, None
    if isinstance(value, datetime):
        return value.date(), None
    if isinstance(value, date):
        return value, None
    text = str(value).strip()
    if not text:
        return None, None
    try:
        return date.fromisoformat(text), None
    except ValueError:
        return None, "дата рождения должна быть в формате ГГГГ-ММ-ДД"


def _normalize_phone_cell(value) -> str | None:
    # openpyxl reads a numeric-looking phone column as a float (e.g.
    # 89991234567.0) — strip the trailing ".0" before handing off to the
    # shared normalizer so it doesn't end up in the digit string.
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return _normalize_phone(value)


async def _run_customers_import(db: AsyncSession, rows: list[list], mapping: dict, skip_first_row: bool) -> dict:
    phone_idx = mapping.get("phone")
    if phone_idx is None:
        raise HTTPException(status_code=400, detail="Не выбрана колонка «Телефон»")
    name_idx = mapping.get("name")
    birthday_idx = mapping.get("birthday")
    email_idx = mapping.get("email")
    comment_idx = mapping.get("comment")

    existing_phones = set((await db.execute(select(Customer.phone))).scalars().all())

    created = 0
    skipped = 0
    errors: list[dict] = []

    for offset, row in enumerate(rows):
        row_no = offset + (2 if skip_first_row else 1)
        if _row_is_blank(row):
            continue

        phone = _normalize_phone_cell(_get(row, phone_idx))
        if phone is None:
            if len(errors) < MAX_ERRORS:
                errors.append({"row": row_no, "message": "Некорректный телефон"})
            continue

        birthday, birthday_err = _parse_birthday_cell(_get(row, birthday_idx))
        if birthday_err:
            if len(errors) < MAX_ERRORS:
                errors.append({"row": row_no, "message": birthday_err})
            continue

        if phone in existing_phones:
            skipped += 1
            continue

        name = _cell_str(_get(row, name_idx)).strip() or None
        email = _cell_str(_get(row, email_idx)).strip() or None
        comment = _cell_str(_get(row, comment_idx)).strip() or None

        db.add(Customer(name=name, phone=phone, birthday=birthday, email=email, comment=comment))
        existing_phones.add(phone)
        created += 1

    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


def _parse_price_cell(value) -> tuple[int | None, str | None]:
    if value in (None, ""):
        return 0, None
    try:
        price = int(round(float(str(value).replace(",", "."))))
    except (TypeError, ValueError):
        return None, "Некорректная цена"
    if price < 0:
        return None, "Цена не может быть отрицательной"
    return price, None


async def _run_items_import(db: AsyncSession, rows: list[list], mapping: dict, skip_first_row: bool) -> dict:
    title_idx = mapping.get("title")
    if title_idx is None:
        raise HTTPException(status_code=400, detail="Не выбрана колонка «Название»")
    price_idx = mapping.get("max_price")
    barcode_idx = mapping.get("barcode")
    category_idx = mapping.get("category")

    category_by_title = {
        title.strip().lower(): cid
        for cid, title in (await db.execute(select(Category.id, Category.title))).all()
        if title
    }
    existing_pairs = {
        (title, barcode or "")
        for title, barcode in (await db.execute(select(Item.title, Item.barcode))).all()
    }

    created = 0
    skipped = 0
    errors: list[dict] = []

    for offset, row in enumerate(rows):
        row_no = offset + (2 if skip_first_row else 1)
        if _row_is_blank(row):
            continue

        title = _cell_str(_get(row, title_idx)).strip()
        if not title:
            if len(errors) < MAX_ERRORS:
                errors.append({"row": row_no, "message": "Не указано название"})
            continue

        price, price_err = _parse_price_cell(_get(row, price_idx))
        if price_err:
            if len(errors) < MAX_ERRORS:
                errors.append({"row": row_no, "message": price_err})
            continue

        barcode = _cell_str(_get(row, barcode_idx)).strip() or None
        key = (title, barcode or "")
        if key in existing_pairs:
            skipped += 1
            continue

        category_id = None
        category_title = _cell_str(_get(row, category_idx)).strip()
        if category_title:
            cache_key = category_title.lower()
            category_id = category_by_title.get(cache_key)
            if category_id is None:
                category = Category(title=category_title, status="on", deleted=False)
                db.add(category)
                await db.flush()
                category_id = category.id
                category_by_title[cache_key] = category_id

        db.add(Item(
            title=title,
            barcode=barcode,
            category_id=category_id,
            min_price=price,
            max_price=price,
            status="on",
        ))
        existing_pairs.add(key)
        created += 1

    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


@router.post("/imports/{entity}/run")
async def run_import(entity: str, request: Request, db: AsyncSession = Depends(get_db)):
    _validate_entity(entity)

    body = await request.json() or {}
    file_token = body.get("fileToken")
    mapping = body.get("mapping")
    skip_first_row = bool(body.get("skipFirstRow", True))

    if not isinstance(mapping, dict) or not mapping:
        raise HTTPException(status_code=400, detail="mapping is required")

    path = _find_upload(str(file_token or ""))
    if path is None:
        raise HTTPException(status_code=400, detail="Файл не найден — загрузите его заново")

    try:
        rows = _read_rows(path)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Не удалось прочитать файл — проверьте формат")

    data_rows = rows[1:] if skip_first_row else rows
    if len(data_rows) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Слишком много строк для импорта (максимум {MAX_ROWS})",
        )

    if entity == "customers":
        return await _run_customers_import(db, data_rows, mapping, skip_first_row)
    return await _run_items_import(db, data_rows, mapping, skip_first_row)


# ---------- GET /v1/imports/{entity}/template ----------

_CUSTOMER_TEMPLATE_ROWS = [
    ["Имя", "Телефон", "Дата рождения", "Email", "Комментарий"],
    ["Анна Смирнова", "+79991234567", "1990-05-12", "anna@example.com", "Постоянный клиент"],
    ["Иван Иванов", "89161234567", "1985-11-23", "", ""],
]

_ITEM_TEMPLATE_ROWS = [
    ["Название", "Цена", "Штрихкод", "Категория"],
    ["Роза красная 60см", "150", "4600000000001", "Розы"],
    ["Упаковочная плёнка", "80", "", "Упаковка"],
]


@router.get("/imports/{entity}/template")
async def download_import_template(entity: str):
    _validate_entity(entity)
    rows = _CUSTOMER_TEMPLATE_ROWS if entity == "customers" else _ITEM_TEMPLATE_ROWS
    filename = "customers-example.csv" if entity == "customers" else "items-example.csv"

    buf = io.StringIO()
    csv.writer(buf, delimiter=";").writerows(rows)
    # Leading BOM so Excel on Windows opens the file as utf-8 instead of guessing cp1251.
    payload = ("﻿" + buf.getvalue()).encode("utf-8")

    return Response(
        content=payload,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
