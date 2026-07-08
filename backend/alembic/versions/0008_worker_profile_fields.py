"""workers: admin staff-form profile fields + system roles seed

Revision ID: 0008_worker_profile_fields
Revises: 0007_order_admin_create_fields
Create Date: 2026-07-09

Adds the columns the admin «Сотрудники» create/edit form persists
(docs/posiflora/admin-map.md §2.6.2): ФИО parts, phone/email contact data,
the bcrypt PIN hash for the POS app, and a JSON list of assigned store ids
(the single store_id FK is kept for compatibility and mirrors store_ids[0]).

Also seeds the six system permission sets (Role rows, is_system=true) shown
on «Настройки доступов» (§2.6.3). The seed is idempotent: a row is inserted
only when no role with that title exists yet, so re-running on a DB where an
admin already created e.g. «Курьер» will not produce duplicates.

All new columns are nullable so existing rows are untouched.
"""

import json
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0008_worker_profile_fields"
down_revision = "0007_order_admin_create_fields"
branch_labels = None
depends_on = None


_PLAIN_COLUMNS = [
    ("surname", sa.String()),
    ("patronymic", sa.String()),
    ("phone", sa.String()),
    ("email", sa.String()),
    ("pin_hash", sa.String()),
    ("store_ids", sa.Text()),
]

# The six fixed access-right sets (admin-map §2.6.2/§2.6.3). «Флорист» ships
# with the discount/markup permissions enabled — same default as Posiflora
# (its roles table shows «Скидки и надбавки» for Флорист and «—» for the rest).
_FLORIST_PERMISSIONS = json.dumps(
    {
        "orderDiscount": True,
        "orderMarkup": True,
        "bouquetDiscount": True,
        "bouquetMarkup": True,
        "customItemPrice": True,
    }
)

_SYSTEM_ROLES = [
    ("Администратор", None),
    ("Флорист", _FLORIST_PERMISSIONS),
    ("Курьер", None),
    ("Администратор точек", None),
    ("Менеджер склада", None),
    ("Менеджер по заказам", None),
]


def upgrade() -> None:
    for name, type_ in _PLAIN_COLUMNS:
        op.add_column("workers", sa.Column(name, type_, nullable=True))

    roles = sa.table(
        "roles",
        sa.column("id", sa.String()),
        sa.column("title", sa.String()),
        sa.column("permissions", sa.Text()),
        sa.column("is_system", sa.Boolean()),
    )
    conn = op.get_bind()
    existing = {
        row[0]
        for row in conn.execute(sa.select(roles.c.title)).fetchall()
    }
    to_insert = [
        {
            "id": uuid.uuid4().hex,
            "title": title,
            "permissions": permissions,
            "is_system": True,
        }
        for title, permissions in _SYSTEM_ROLES
        if title not in existing
    ]
    if to_insert:
        op.bulk_insert(roles, to_insert)


def downgrade() -> None:
    # Seeded roles are left in place on downgrade — workers may reference them.
    for name, _ in reversed(_PLAIN_COLUMNS):
        op.drop_column("workers", name)
