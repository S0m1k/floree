"""customers: admin card/form fields + bonus history table

Revision ID: 0008_customer_card_fields
Revises: 0007_order_admin_create_fields
Create Date: 2026-07-09

Adds the columns the admin «Создание/редактирование клиента» form persists
(docs/posiflora/admin-map.md §2.5.1) — instagram, customer_type, card_number,
preferences — and the customer_bonus_history table backing the «Бонусы» tab of
the customer card (история списаний и начислений).

All new customer columns are nullable so existing ETL rows are untouched.
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_customer_card_fields"
down_revision = "0007_order_admin_create_fields"
branch_labels = None
depends_on = None


_CUSTOMER_COLUMNS = [
    ("instagram", sa.String()),
    ("customer_type", sa.String()),
    ("card_number", sa.String()),
    ("preferences", sa.String()),
]


def upgrade() -> None:
    for name, type_ in _CUSTOMER_COLUMNS:
        op.add_column("customers", sa.Column(name, type_, nullable=True))

    op.create_table(
        "customer_bonus_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "customer_id",
            sa.String(),
            sa.ForeignKey("customers.id", name="fk_cbh_customer_id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        sa.Column("order_id", sa.String(), nullable=True),
        sa.Column(
            "worker_id",
            sa.String(),
            sa.ForeignKey("workers.id", name="fk_cbh_worker_id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_customer_bonus_history_customer_id", "customer_bonus_history", ["customer_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_customer_bonus_history_customer_id", table_name="customer_bonus_history")
    op.drop_table("customer_bonus_history")
    for name, _ in reversed(_CUSTOMER_COLUMNS):
        op.drop_column("customers", name)
