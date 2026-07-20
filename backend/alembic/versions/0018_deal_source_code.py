"""customer_deal_sources.code — machine-readable channel code

Revision ID: 0018_deal_source_code
Revises: 0017_shop_settings
Create Date: 2026-07-20

Adds a stable `code` to «Источники сделок» (admin-map §2.2.2 / §3.4) so order
channels can auto-assign their source without matching user-editable titles:
the storefront checkout stamps `site`, the future POS терминал stamps
`terminal`, admin form keeps manual chips. Backfills codes onto rows imported
from Posiflora by title match; missing well-known rows are NOT created here —
`get_or_create_deal_source` creates them lazily on first use.
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_deal_source_code"
down_revision = "0017_shop_settings"
branch_labels = None
depends_on = None

# title (lowercased) -> code
_BACKFILL = {
    "сайт": "site",
    "терминал": "terminal",
    "телефон": "phone",
    "amocrm": "amocrm",
}


def upgrade() -> None:
    op.add_column("customer_deal_sources", sa.Column("code", sa.String(), nullable=True))
    op.create_index(
        "ix_customer_deal_sources_code",
        "customer_deal_sources",
        ["code"],
        unique=True,
    )
    # Title matching is done in Python: SQLite's lower() can't fold Cyrillic.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, title FROM customer_deal_sources WHERE code IS NULL")
    ).fetchall()
    taken: set[str] = set()
    for row_id, title in rows:
        code = _BACKFILL.get((title or "").casefold())
        if code and code not in taken:
            taken.add(code)
            conn.execute(
                sa.text("UPDATE customer_deal_sources SET code = :code WHERE id = :id"),
                {"code": code, "id": row_id},
            )


def downgrade() -> None:
    op.drop_index("ix_customer_deal_sources_code", table_name="customer_deal_sources")
    op.drop_column("customer_deal_sources", "code")
