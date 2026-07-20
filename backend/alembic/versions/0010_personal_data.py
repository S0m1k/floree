"""settings: personal data (ПДн) consent template — singleton table

Revision ID: 0010_personal_data
Revises: 0009_worker_profile_fields
Create Date: 2026-07-11

Adds `personal_data_templates`, a one-row table backing the admin «Форма
заполнения политики» screen (docs/posiflora/admin-map.md §2.7): the editable
consent-to-processing-personal-data template (ИП/ООО title, ИНН, legal
address, website, email) shown to customers / on the storefront.
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_personal_data"
down_revision = "0009_worker_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personal_data_templates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("ip_title", sa.String(), nullable=True),
        sa.Column("inn", sa.String(), nullable=True),
        sa.Column("legal_address", sa.String(), nullable=True),
        sa.Column("website", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("personal_data_templates")
