"""Склад: журнал движений остатков (stock_movements)

Revision ID: 0021_stock_movements
Revises: 0020_fiscal_receipts
Create Date: 2026-07-21

Свой складской учёт (Posiflora остатков через API не отдаёт — проверено):
журнал подписанных движений (+приход/−расход) по (товар, склад точки) с
причиной (acceptance/sale/writeoff/inventory/movement/correction), ссылками
на заказ или складской документ и закупочной ценой для себестоимости.
stock_balances (уже существует) поддерживается материализованно.
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_stock_movements"
down_revision = "0020_fiscal_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("item_id", sa.String(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.String(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("source_kind", sa.String(), nullable=True),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("worker_id", sa.String(), sa.ForeignKey("workers.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_stock_movements_item_id", "stock_movements", ["item_id"])
    op.create_index("ix_stock_movements_warehouse_id", "stock_movements", ["warehouse_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_movements_warehouse_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_item_id", table_name="stock_movements")
    op.drop_table("stock_movements")
