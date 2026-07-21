"""Фискализация aQsi — журнал чеков (fiscal_receipts)

Revision ID: 0020_fiscal_receipts
Revises: 0019_pos_terminal
Create Date: 2026-07-20

Журнал фискальных чеков продаж POS: связь с заказом/платежом, id асинхронной
операции aQsi и статус (pending/registered/failed/skipped). Продажа не
блокируется кассой — упавшие чеки добиваются повтором.
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_fiscal_receipts"
down_revision = "0019_pos_terminal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fiscal_receipts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("payment_id", sa.String(), sa.ForeignKey("payments.id"), nullable=True),
        sa.Column("provider", sa.String(), nullable=False, server_default="aqsi"),
        sa.Column("operation_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_fiscal_receipts_order_id", "fiscal_receipts", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_fiscal_receipts_order_id", table_name="fiscal_receipts")
    op.drop_table("fiscal_receipts")
