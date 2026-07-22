"""POS: платёж привязывается к кассовой смене (payments.shift_id)

Revision ID: 0022_payment_shift
Revises: 0021_stock_movements
Create Date: 2026-07-21

Ожидаемый нал смены должен учитывать не только продажи кассы, но и принятые
кассой предоплаты заказов — поэтому нал-платёж помечается сменой, в которую
он попал в ящик, а расчёт ожидаемой кассы идёт по payments.shift_id (а не по
привязке заказа).
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_payment_shift"
down_revision = "0021_stock_movements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch:
        batch.add_column(sa.Column("shift_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_payments_shift_id", "shifts", ["shift_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch:
        batch.drop_constraint("fk_payments_shift_id", type_="foreignkey")
        batch.drop_column("shift_id")
