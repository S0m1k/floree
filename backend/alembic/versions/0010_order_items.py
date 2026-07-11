"""order composition (order_items) + order totals + manual advance payments

Revision ID: 0010_order_items
Revises: 0009_worker_profile_fields
Create Date: 2026-07-11

Backs the order card «Продукты» tab (admin-map.md §2.2.1):

- `order_items` — the order composition. A `bouquet` row can own nested `item`
  component rows via parent_id. Prices are snapshots frozen server-side when the
  line is added (never taken from the client — memory payment-price-vuln).
- `orders` gains markup_total/discount_total/bonus_paid for the итоговая панель.
  They stay 0 in this track (no order-level discount UI yet) but keep the totals
  and К ОПЛАТЕ honest once it lands.
- `payments` gains method/kind/created_by_id so a manual in-store advance
  (Наличные/Карта/СБП/Перевод) can be recorded alongside the T-Bank gateway
  payments without changing the webhook/checkout path.

All added columns are nullable or have server defaults so existing ETL/checkout
rows are untouched.
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_order_items"
down_revision = "0009_worker_profile_fields"
branch_labels = None
depends_on = None

Money = sa.Numeric(12, 2)
Qty = sa.Numeric(12, 3)


def upgrade() -> None:
    op.create_table(
        "order_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=False, index=True),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("order_items.id"), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("bouquet_id", sa.String(), sa.ForeignKey("bouquets.id"), nullable=True),
        sa.Column("inventory_item_id", sa.String(), sa.ForeignKey("items.id"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("unit_price", Money, nullable=False, server_default="0"),
        sa.Column("quantity", Qty, nullable=False, server_default="1"),
        sa.Column("measure", sa.String(), nullable=False, server_default="Штука"),
        sa.Column("markup", Money, nullable=False, server_default="0"),
        sa.Column("discount", Money, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    # ix_order_items_order_id is created by index=True on the order_id column.

    op.add_column("orders", sa.Column("markup_total", Money, nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("discount_total", Money, nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("bonus_paid", Money, nullable=False, server_default="0"))

    op.add_column("payments", sa.Column("method", sa.String(), nullable=True))
    op.add_column("payments", sa.Column("kind", sa.String(), nullable=False, server_default="payment"))
    # batch_alter_table: SQLite can't ALTER-add a column with an inline FK
    # (same copy-and-move pattern as 0006_order_crm_fields).
    with op.batch_alter_table("payments") as b:
        b.add_column(
            sa.Column(
                "created_by_id",
                sa.String(),
                sa.ForeignKey("workers.id", name="fk_payments_created_by_id"),
                nullable=True,
            )
        )


def downgrade() -> None:
    # batch mode: SQLite can't drop an FK-bearing column via plain ALTER.
    with op.batch_alter_table("payments") as b:
        b.drop_column("created_by_id")
    op.drop_column("payments", "kind")
    op.drop_column("payments", "method")

    op.drop_column("orders", "bonus_paid")
    op.drop_column("orders", "discount_total")
    op.drop_column("orders", "markup_total")

    op.drop_table("order_items")  # drops ix_order_items_order_id with it
