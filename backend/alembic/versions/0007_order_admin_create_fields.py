"""orders: admin create-form fields (budget, delivery, tags, order number)

Revision ID: 0007_order_admin_create_fields
Revises: 0006_order_crm_fields
Create Date: 2026-07-08

Adds the columns the admin «Создание заказа» form persists
(docs/posiflora/admin-map.md §2.2.2). Order composition/prices are NOT part of
this — «Бюджет» is an advisory target, order sums stay server-computed and are
never taken from the client (§2.2.1).

All columns are nullable so existing checkout/ETL rows are untouched.
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_order_admin_create_fields"
down_revision = "0006_order_crm_fields"
branch_labels = None
depends_on = None


# Plain (unconstrained) columns can be added directly; SQLite only needs
# batch mode for the FK column (customer_id) — same convention as 0006.
_PLAIN_COLUMNS = [
    ("order_number", sa.Integer()),
    ("budget", sa.Numeric(12, 2)),
    ("delivery_type", sa.String()),
    ("delivery_city", sa.String()),
    ("delivery_street", sa.String()),
    ("delivery_house", sa.String()),
    ("delivery_apartment", sa.String()),
    ("delivery_building", sa.String()),
    ("delivery_time_from", sa.String()),
    ("delivery_time_to", sa.String()),
    ("due_date", sa.String()),
    ("tags_json", sa.Text()),
]


def upgrade() -> None:
    for name, type_ in _PLAIN_COLUMNS:
        op.add_column("orders", sa.Column(name, type_, nullable=True))
    with op.batch_alter_table("orders") as b:
        b.add_column(
            sa.Column(
                "customer_id",
                sa.String(),
                sa.ForeignKey("customers.id", name="fk_orders_customer_id"),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("orders") as b:
        b.drop_column("customer_id")
    for name, _ in reversed(_PLAIN_COLUMNS):
        op.drop_column("orders", name)
