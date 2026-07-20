"""expenses + generated_files: Отчёты / Финансовый учёт / история выгрузок

Revision ID: 0016_reports_finance
Revises: 0015_order_discount_markup
Create Date: 2026-07-20

Backs three admin screens (docs/posiflora/admin-map.md):
- §2.4.6 «Отчёты» (/admin/reports) — five report types generated server-side
  as CSV and persisted so they can be re-downloaded/refreshed later.
- §2.4.7 «Финансовый учёт» (/admin/financial-accounting) — manual expense
  entries (`expenses`) feeding the Прибыль и убытки (P&L) summary.
- §2.4.5/§2.4.8 «Экспорт товаров» / «Экспорт таблиц» — a shared history of
  every generated file (reports AND the existing customers/items CSV
  exports), so both screens can list past exports uniformly.

`generated_files` is intentionally generic (kind + optional period + CSV
content) rather than one table per export type — Posiflora treats all of
these as rows in one "generated files" ledger and the admin screens are just
different filtered views (`kind` prefix) over it.
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_reports_finance"
down_revision = "0015_order_discount_markup"
branch_labels = None
depends_on = None

Money = sa.Numeric(12, 2)


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("article", sa.String(), nullable=False),
        sa.Column("amount", Money, nullable=False, server_default="0"),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "store_id", sa.String(), sa.ForeignKey("stores.id"), nullable=False
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_by_id",
            sa.String(),
            sa.ForeignKey("workers.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "generated_files",
        sa.Column("id", sa.String(), primary_key=True),
        # 'report:payments' | 'report:sales' | 'report:vendors' |
        # 'report:goods-flow' | 'report:bouquets' | 'items-export' |
        # 'customers-export'
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("period_from", sa.Date(), nullable=True),
        sa.Column("period_to", sa.Date(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="done"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_by_id",
            sa.String(),
            sa.ForeignKey("workers.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_generated_files_kind", "generated_files", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_generated_files_kind", table_name="generated_files")
    op.drop_table("generated_files")
    op.drop_table("expenses")
