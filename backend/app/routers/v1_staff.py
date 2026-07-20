"""Posiflora-compatible /v1 endpoints for «Контроль сотрудников».

Workers CRUD (admin «Сотрудники», admin-map §2.6.2), roles / permission sets
(«Настройки доступов», §2.6.3), cash-register shifts («Рабочие смены», §2.6.1)
and florist-app devices («Устройства флористов», §2.6.4).

Security invariants (see docs/posiflora/admin-map.md §2.6):
- passwords and PINs are stored ONLY as bcrypt hashes (password_hash /
  pin_hash) and are never serialized back or logged;
- PATCH changes a password/PIN only when the field is present and non-empty;
- login is unique across workers (duplicate → 400).
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.catalog_models import Store
from app.staff_models import Worker, Role, Shift, Device
from app.jsonapi import document
from app.serializers import (
    worker_resource,
    role_resource,
    shift_resource,
    device_resource,
)
from app.services.auth import hash_password

from app.deps import get_current_worker

router = APIRouter(
    prefix="/v1", tags=["v1-staff"], dependencies=[Depends(get_current_worker)]
)

# Fixed access-right sets (admin-map §2.6.2) — the workers form offers exactly
# these chips; anything else in the payload is a validation error.
ACCESS_RIGHT_SETS = [
    "Администратор",
    "Флорист",
    "Курьер",
    "Администратор точек",
    "Менеджер склада",
    "Менеджер по заказам",
]

# Role.permissions JSON keys (POS/Florist discount limits, admin-map §2.6.3).
PERMISSION_KEYS = [
    "orderDiscount",
    "orderMarkup",
    "bouquetDiscount",
    "bouquetMarkup",
    "customItemPrice",
]

WORKER_STATUSES = ["active", "inactive"]

NAME_MAX = 32
LOGIN_MAX = 30
PASSWORD_MAX = 20
EMAIL_MAX = 64


def _page(qs) -> tuple[int, int]:
    def _int(key, default):
        try:
            return int(qs.get(key, default))
        except (TypeError, ValueError):
            return default
    return _int("page[number]", 1), _int("page[size]", 200)


def _rel_id(rels: dict, key: str) -> str | None:
    node = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    return node.get("id") if isinstance(node, dict) else None


def _rel_ids(rels: dict, key: str) -> list[str]:
    data = (rels.get(key) or {}).get("data") if isinstance(rels.get(key), dict) else None
    if not isinstance(data, list):
        return []
    return [n["id"] for n in data if isinstance(n, dict) and n.get("id")]


async def _paginated(db, base, serializer, request):
    number, size = _page(request.query_params)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.offset((number - 1) * size).limit(size))).scalars().all()
    data = [serializer(r) for r in rows]
    return document(data, meta={"page": {"number": number, "size": size}, "total": total})


# ---------- workers ----------


def _check_len(value: str | None, field: str, max_len: int) -> None:
    if value is not None and len(value) > max_len:
        raise HTTPException(
            status_code=400, detail=f"{field} exceeds {max_len} characters"
        )


async def _validate_login_unique(db: AsyncSession, login: str, exclude_id: str | None) -> None:
    stmt = select(Worker).where(Worker.login == login)
    if exclude_id:
        stmt = stmt.where(Worker.id != exclude_id)
    if (await db.execute(stmt)).scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="login already in use")


def _validate_pin(pin) -> None:
    if not (isinstance(pin, str) and len(pin) == 4 and pin.isdigit()):
        raise HTTPException(status_code=400, detail="pin must be exactly 4 digits")


def _validate_access_rights(rights) -> list[str]:
    if not isinstance(rights, list):
        raise HTTPException(status_code=400, detail="accessRights must be a list")
    for r in rights:
        if r not in ACCESS_RIGHT_SETS:
            raise HTTPException(
                status_code=400, detail=f"unknown access right: {r!r}"
            )
    return rights


async def _validate_store_ids(db: AsyncSession, store_ids: list[str]) -> None:
    for sid in store_ids:
        store = (await db.execute(select(Store).where(Store.id == sid))).scalar_one_or_none()
        if store is None:
            raise HTTPException(status_code=400, detail=f"store not found: {sid}")


async def _resolve_role(db: AsyncSession, rels: dict, attrs: dict) -> str | None:
    """Return a role id from the relationship, or create/find a Role by
    `attributes.roleTitle` (the creatable «Роли» select, admin-map §2.6.2)."""
    role_id = _rel_id(rels, "role")
    if role_id:
        role = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=400, detail="role not found")
        return role.id
    title = attrs.get("roleTitle")
    if title:
        title = str(title).strip()
        if not title:
            return None
        existing = (
            await db.execute(select(Role).where(Role.title == title))
        ).scalar_one_or_none()
        if existing is not None:
            return existing.id
        role = Role(title=title, is_system=False)
        db.add(role)
        await db.flush()
        return role.id
    return None


def _assemble_name(first_name: str, surname: str) -> str:
    """«Имя Фамилия» — the shape existing screens read from worker.name."""
    return " ".join(p for p in (first_name.strip(), surname.strip()) if p)


@router.get("/workers")
async def list_workers(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    base = select(Worker).order_by(Worker.created_at, Worker.id)
    store_id = qs.get("filter[store]")
    if store_id:
        base = base.where(Worker.store_id == store_id)
    return await _paginated(db, base, worker_resource, request)


@router.get("/workers/{worker_id}")
async def get_worker(worker_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Worker).where(Worker.id == worker_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return document(worker_resource(row))


@router.post("/workers", status_code=201)
async def create_worker(request: Request, db: AsyncSession = Depends(get_db)):
    """Create a staff member from the admin «Новый сотрудник» form (§2.6.2)."""
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "workers"):
        raise HTTPException(status_code=400, detail="data.type must be 'workers'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    first_name = (attrs.get("firstName") or "").strip()
    surname = (attrs.get("surname") or "").strip()
    if not first_name or not surname:
        raise HTTPException(status_code=400, detail="firstName and surname are required")
    patronymic = (attrs.get("patronymic") or "").strip() or None
    phone = (attrs.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    email = (attrs.get("email") or "").strip() or None
    login = (attrs.get("login") or "").strip() or None

    _check_len(first_name, "firstName", NAME_MAX)
    _check_len(surname, "surname", NAME_MAX)
    _check_len(patronymic, "patronymic", NAME_MAX)
    _check_len(email, "email", EMAIL_MAX)
    _check_len(login, "login", LOGIN_MAX)

    if login:
        await _validate_login_unique(db, login, exclude_id=None)

    password = attrs.get("password")
    if password:
        _check_len(password, "password", PASSWORD_MAX)
    pin = attrs.get("pin")
    if pin:
        _validate_pin(pin)

    access_rights = _validate_access_rights(attrs.get("accessRights") or [])

    store_ids = _rel_ids(rels, "stores")
    await _validate_store_ids(db, store_ids)

    role_id = await _resolve_role(db, rels, attrs)

    worker = Worker(
        name=_assemble_name(first_name, surname),
        surname=surname,
        patronymic=patronymic,
        phone=phone,
        email=email,
        login=login,
        # Plaintext secrets never touch the row: bcrypt-hash or nothing.
        password_hash=hash_password(password) if password else None,
        pin_hash=hash_password(pin) if pin else None,
        role_id=role_id,
        store_id=store_ids[0] if store_ids else None,
        store_ids=json.dumps(store_ids) if store_ids else None,
        access_rights=json.dumps(access_rights, ensure_ascii=False) if access_rights else None,
        status="active",
    )
    db.add(worker)
    await db.commit()
    await db.refresh(worker)
    return document(worker_resource(worker))


@router.patch("/workers/{worker_id}")
async def update_worker(
    worker_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Edit a staff member / toggle status (admin «Редактировать» и
    «Приостановить»/«Активировать», §2.6.2).

    Partial update: only the fields present in the payload change. An absent or
    empty password/pin leaves the current hash untouched.
    """
    worker = (
        await db.execute(select(Worker).where(Worker.id == worker_id))
    ).scalar_one_or_none()
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "workers"):
        raise HTTPException(status_code=400, detail="data.type must be 'workers'")
    attrs = data.get("attributes") or {}
    rels = data.get("relationships") or {}

    if "firstName" in attrs or "surname" in attrs:
        first_name = (attrs.get("firstName") or "").strip()
        surname = (attrs.get("surname") or "").strip()
        # The edit form always submits both; treat blanks as invalid.
        if not first_name or not surname:
            raise HTTPException(
                status_code=400, detail="firstName and surname are required"
            )
        _check_len(first_name, "firstName", NAME_MAX)
        _check_len(surname, "surname", NAME_MAX)
        worker.name = _assemble_name(first_name, surname)
        worker.surname = surname

    if "patronymic" in attrs:
        patronymic = (attrs.get("patronymic") or "").strip() or None
        _check_len(patronymic, "patronymic", NAME_MAX)
        worker.patronymic = patronymic

    if "phone" in attrs:
        phone = (attrs.get("phone") or "").strip()
        if not phone:
            raise HTTPException(status_code=400, detail="phone is required")
        worker.phone = phone

    if "email" in attrs:
        email = (attrs.get("email") or "").strip() or None
        _check_len(email, "email", EMAIL_MAX)
        worker.email = email

    if "login" in attrs:
        login = (attrs.get("login") or "").strip() or None
        _check_len(login, "login", LOGIN_MAX)
        if login:
            await _validate_login_unique(db, login, exclude_id=worker.id)
        worker.login = login

    # Secrets: change only when present AND non-empty (empty inputs on the
    # edit form mean «не менять»). Never store or echo plaintext.
    password = attrs.get("password")
    if password:
        _check_len(password, "password", PASSWORD_MAX)
        worker.password_hash = hash_password(password)
    pin = attrs.get("pin")
    if pin:
        _validate_pin(pin)
        worker.pin_hash = hash_password(pin)

    if "accessRights" in attrs:
        rights = _validate_access_rights(attrs.get("accessRights") or [])
        worker.access_rights = (
            json.dumps(rights, ensure_ascii=False) if rights else None
        )

    if "status" in attrs:
        status = attrs.get("status")
        if status not in WORKER_STATUSES:
            raise HTTPException(
                status_code=400, detail=f"status must be one of {WORKER_STATUSES}"
            )
        worker.status = status

    if "stores" in rels:
        store_ids = _rel_ids(rels, "stores")
        await _validate_store_ids(db, store_ids)
        worker.store_ids = json.dumps(store_ids) if store_ids else None
        worker.store_id = store_ids[0] if store_ids else None

    if "role" in rels or attrs.get("roleTitle"):
        if "role" in rels and rels["role"].get("data") is None:
            worker.role_id = None
        else:
            worker.role_id = await _resolve_role(db, rels, attrs)

    await db.commit()
    await db.refresh(worker)
    return document(worker_resource(worker))


# ---------- roles («Настройки доступов») ----------


@router.get("/roles")
async def list_roles(request: Request, db: AsyncSession = Depends(get_db)):
    base = select(Role).order_by(Role.is_system.desc(), Role.title)
    return await _paginated(db, base, role_resource, request)


@router.get("/roles/{role_id}")
async def get_role(role_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return document(role_resource(row))


@router.post("/roles", status_code=201)
async def create_role(request: Request, db: AsyncSession = Depends(get_db)):
    """Create a custom role (the creatable «Роли» select on the worker form)."""
    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "roles"):
        raise HTTPException(status_code=400, detail="data.type must be 'roles'")
    attrs = data.get("attributes") or {}
    title = (attrs.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    existing = (
        await db.execute(select(Role).where(Role.title == title))
    ).scalar_one_or_none()
    if existing is not None:
        # Idempotent for the creatable select: return the existing role.
        return document(role_resource(existing))
    role = Role(title=title, is_system=False)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return document(role_resource(role))


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Save POS/Florist discount-and-markup permissions for a role (§2.6.3)."""
    role = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    body = await request.json()
    data = (body or {}).get("data") or {}
    if data.get("type") not in (None, "roles"):
        raise HTTPException(status_code=400, detail="data.type must be 'roles'")
    attrs = data.get("attributes") or {}

    if "title" in attrs:
        title = (attrs.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title must not be empty")
        role.title = title

    if "permissions" in attrs:
        permissions = attrs.get("permissions")
        if permissions is None:
            role.permissions = None
        else:
            if not isinstance(permissions, dict):
                raise HTTPException(
                    status_code=400, detail="permissions must be an object"
                )
            unknown = [k for k in permissions if k not in PERMISSION_KEYS]
            if unknown:
                raise HTTPException(
                    status_code=400, detail=f"unknown permission keys: {unknown}"
                )
            if not all(isinstance(v, bool) for v in permissions.values()):
                raise HTTPException(
                    status_code=400, detail="permission values must be booleans"
                )
            role.permissions = json.dumps(permissions)

    await db.commit()
    await db.refresh(role)
    return document(role_resource(role))


# ---------- shifts («Рабочие смены») ----------


def _parse_date(value: str | None, field: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be an ISO date")


@router.get("/shifts")
async def list_shifts(request: Request, db: AsyncSession = Depends(get_db)):
    qs = request.query_params
    base = select(Shift).order_by(Shift.opened_at.desc(), Shift.id)

    store_id = qs.get("filter[store]")
    if store_id:
        base = base.where(Shift.store_id == store_id)
    worker_id = qs.get("filter[worker]")
    if worker_id:
        base = base.where(
            or_(Shift.opened_by_id == worker_id, Shift.closed_by_id == worker_id)
        )
    date_from = _parse_date(qs.get("filter[dateFrom]"), "filter[dateFrom]")
    if date_from:
        base = base.where(Shift.opened_at >= date_from)
    date_to = _parse_date(qs.get("filter[dateTo]"), "filter[dateTo]")
    if date_to:
        # Inclusive day: anything opened before the end of that day qualifies.
        base = base.where(
            Shift.opened_at <= date_to.replace(hour=23, minute=59, second=59)
        )

    return await _paginated(db, base, shift_resource, request)


# ---------- devices («Устройства флористов») ----------


@router.get("/devices")
async def list_devices(request: Request, db: AsyncSession = Depends(get_db)):
    base = select(Device).order_by(Device.created_at.desc(), Device.id)
    return await _paginated(db, base, device_resource, request)
