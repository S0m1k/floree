"""POS-терминал: касса смены + привязка продажи к смене

Revision ID: 0019_pos_terminal
Revises: 0018_deal_source_code
Create Date: 2026-07-20

Кассовая механика терминала (admin-map §2.6.1 «Рабочие смены»):
- shifts.opening_cash / closing_cash — пересчитанный нал при открытии и
  закрытии смены; ожидаемая касса = opening_cash + нал-продажи смены +
  внесения − изъятия.
- orders.shift_id — продажи терминала привязываются к смене, чтобы считать
  ожидаемый нал; заказы витрины/админки/ETL остаются NULL.
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_pos_terminal"
down_revision = "0018_deal_source_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shifts", sa.Column("opening_cash", sa.Numeric(12, 2), nullable=True))
    op.add_column("shifts", sa.Column("closing_cash", sa.Numeric(12, 2), nullable=True))
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("shift_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_orders_shift_id", "shifts", ["shift_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_constraint("fk_orders_shift_id", type_="foreignkey")
        batch.drop_column("shift_id")
    op.drop_column("shifts", "closing_cash")
    op.drop_column("shifts", "opening_cash")
