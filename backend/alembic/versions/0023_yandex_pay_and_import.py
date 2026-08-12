"""Yandex Pay provider fields + payments.provider.

New TABLES (posiflora_settings, import_runs) arrive via create_all on startup;
this migration only ALTERs pre-existing tables, idempotently (IF NOT EXISTS)
so a fresh install — where create_all already built the full columns — is safe.

Revision ID: 0023_yandex_pay_and_import
Revises: 0022_payment_shift
"""

from alembic import op

revision = "0023_yandex_pay_and_import"
down_revision = "0022_payment_shift"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR DEFAULT 'tbank'")
    op.execute("ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS active_provider VARCHAR DEFAULT 'tbank'")
    op.execute("ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS yapay_merchant_id VARCHAR")
    op.execute("ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS yapay_api_key VARCHAR")
    op.execute("ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS yapay_sandbox BOOLEAN DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS provider")
    op.execute("ALTER TABLE payment_settings DROP COLUMN IF EXISTS active_provider")
    op.execute("ALTER TABLE payment_settings DROP COLUMN IF EXISTS yapay_merchant_id")
    op.execute("ALTER TABLE payment_settings DROP COLUMN IF EXISTS yapay_sandbox")
    op.execute("ALTER TABLE payment_settings DROP COLUMN IF EXISTS yapay_api_key")
