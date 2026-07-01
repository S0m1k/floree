"""add orders.order_payload for deferred Posiflora order creation

Revision ID: 0003_order_payload
Revises: 0002_phase1
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_order_payload"
down_revision = "0002_phase1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("order_payload", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "order_payload")
