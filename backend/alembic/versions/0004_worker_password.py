"""add workers.password_hash + login index for auth

Revision ID: 0004_worker_password
Revises: 0003_order_payload
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_worker_password"
down_revision = "0003_order_payload"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workers", sa.Column("password_hash", sa.String(), nullable=True))
    op.create_index("ix_workers_login", "workers", ["login"])


def downgrade() -> None:
    op.drop_index("ix_workers_login", table_name="workers")
    op.drop_column("workers", "password_hash")
