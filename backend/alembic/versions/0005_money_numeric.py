"""transactional money columns Integer -> Numeric(12,2)

Revision ID: 0005_money_numeric
Revises: 0004_worker_password
Create Date: 2026-07-01

Preserve fractional rubles (e.g. 5142.50) on imported transactional amounts.
Catalog prices (specification/item/price_value, thresholds) stay Integer.
Values are numerically unchanged by the type widening.
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_money_numeric"
down_revision = "0004_worker_password"
branch_labels = None
depends_on = None

# table -> money columns to widen
COLS = {
    "orders": ["total_amount"],
    "payments": ["amount"],
    "bouquets": ["amount", "sale_amount"],
    "stock_balances": ["cost_price"],
    "packing_invoices": ["total_amount", "payment_amount"],
    "packing_invoice_items": ["price", "amount"],
    "writeoff_invoices": ["total_amount"],
    "writeoff_invoice_items": ["cost_price"],
    "markdown_act_items": ["old_price", "new_price"],
    "inventory_acts": ["financial_result"],
    "movement_acts": ["cost"],
    "movement_act_items": ["cost_price"],
}

_MONEY = sa.Numeric(12, 2)
_INT = sa.Integer()


def _alter(to_type, from_type):
    for table, cols in COLS.items():
        with op.batch_alter_table(table) as b:
            for c in cols:
                b.alter_column(c, existing_type=from_type, type_=to_type,
                               existing_nullable=False)


def upgrade() -> None:
    _alter(_MONEY, _INT)


def downgrade() -> None:
    _alter(_INT, _MONEY)
