"""orders: CRM/fulfillment fields (store, florist, source, status history)

Revision ID: 0006_order_crm_fields
Revises: 0005_money_numeric
Create Date: 2026-07-03

`orders.status` used to double as both the payment-gateway lifecycle
(pending/paid/amount_mismatch, set by the checkout webhook) and, for
ETL-imported rows, Posiflora's real CRM/fulfillment status (new/assembled/
completed/...). This splits them: `status` becomes the CRM workflow status
(docs/posiflora/admin-map.md admin "Заказы" status tabs), `payment_status`
takes over the payment-gateway lifecycle.

Backfill:
- checkout-created rows (posiflora_id IS NULL) never had a real workflow
  status, so their old `status` value (pending/paid/...) is moved to the new
  `payment_status` column and `status` is reset to 'new'.
- ETL-imported rows (posiflora_id IS NOT NULL) already carry the correct
  workflow value in `status` (Phase 3 ETL wrote Posiflora's raw status
  there) — left untouched. Their `payment_status` is derived from whether a
  CONFIRMED payment exists.
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_order_crm_fields"
down_revision = "0005_money_numeric"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table (copy-and-move) is required by Alembic's SQLite dialect
    # for adding a column with an inline FK — plain add_column only works for
    # unconstrained columns there. Every FK needs an explicit name for batch
    # mode to rebuild the table.
    op.add_column("orders", sa.Column("payment_status", sa.String(), nullable=False, server_default="pending"))
    with op.batch_alter_table("orders") as b:
        b.add_column(sa.Column("store_id", sa.String(), sa.ForeignKey("stores.id", name="fk_orders_store_id"), nullable=True))
        b.add_column(sa.Column("source_id", sa.String(), sa.ForeignKey("customer_deal_sources.id", name="fk_orders_source_id"), nullable=True))
        b.add_column(sa.Column("florist_id", sa.String(), sa.ForeignKey("workers.id", name="fk_orders_florist_id"), nullable=True))
        b.add_column(sa.Column("created_by_id", sa.String(), sa.ForeignKey("workers.id", name="fk_orders_created_by_id"), nullable=True))
        b.add_column(sa.Column("closed_by_id", sa.String(), sa.ForeignKey("workers.id", name="fk_orders_closed_by_id"), nullable=True))
        b.add_column(sa.Column("closed_at", sa.DateTime(), nullable=True))

    conn = op.get_bind()

    # Checkout rows: old `status` (pending/paid/failed/cancelled/amount_mismatch)
    # was payment-lifecycle all along — move it, then reset the workflow status.
    conn.execute(sa.text(
        "UPDATE orders SET payment_status = status WHERE posiflora_id IS NULL"
    ))
    conn.execute(sa.text(
        "UPDATE orders SET status = 'new' WHERE posiflora_id IS NULL"
    ))

    # ETL rows: `status` already holds the real Posiflora workflow value.
    # Derive payment_status from whether a confirmed payment exists.
    conn.execute(sa.text(
        "UPDATE orders SET payment_status = 'paid' "
        "WHERE posiflora_id IS NOT NULL AND EXISTS ("
        "  SELECT 1 FROM payments WHERE payments.order_id = orders.id "
        "  AND payments.status = 'CONFIRMED'"
        ")"
    ))

    op.create_table(
        "order_status_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("worker_id", sa.String(), sa.ForeignKey("workers.id"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("order_status_history")
    with op.batch_alter_table("orders") as b:
        b.drop_column("closed_at")
        b.drop_column("closed_by_id")
        b.drop_column("created_by_id")
        b.drop_column("florist_id")
        b.drop_column("source_id")
        b.drop_column("store_id")
    op.drop_column("orders", "payment_status")
