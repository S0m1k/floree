"""orders: delivery comment column

Revision ID: 0013_order_delivery_comment
Revises: 0012_specification_composition
Create Date: 2026-07-18

Posiflora's `deliveryComments` is a courier-facing note distinct from the
order's own `description` (already mapped to `orders.comment` — "Пожелания
клиента" per admin-map.md §2.2.1). There was no column for it, so the ETL
(app/etl/transforms.py map_order) silently dropped it. Adds a plain nullable
column; no backfill needed since prior imports never had the data.
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_order_delivery_comment"
down_revision = "0012_specification_composition"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("delivery_comment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "delivery_comment")
