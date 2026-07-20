"""settings: online storefront (shop_settings) — singleton table

Revision ID: 0017_shop_settings
Revises: 0016_reports_finance
Create Date: 2026-07-20

Adds `shop_settings`, a one-row table backing the admin «Онлайн-витрина»
screen (docs/posiflora/admin-map.md §2.3.2): the editable contact/branding
info for our public storefront (floree.ru), an on/off switch and an
announcement banner. Same singleton pattern as `personal_data_templates`
(0010_personal_data) — fixed id, GET/PUT never have to guess which row.
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_shop_settings"
down_revision = "0016_reports_finance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("shop_title", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("email_orders", sa.String(), nullable=True),
        sa.Column("instagram", sa.String(), nullable=True),
        sa.Column("telegram", sa.String(), nullable=True),
        sa.Column("whatsapp", sa.String(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("announcement", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("shop_settings")
