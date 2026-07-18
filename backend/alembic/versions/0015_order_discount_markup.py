"""orders/order_items: discount + markup reason/percent columns

Revision ID: 0015_order_discount_markup
Revises: 0013_order_delivery_comment
Create Date: 2026-07-18

Backs the order card «Продукты» tab discount/markup/bonus-payment feature
(admin-map.md §2.2.1). `orders.discount_total`/`markup_total`/`bonus_paid`
already existed (0011_order_items) but had no admin UI or write endpoints —
this adds the columns needed to remember *how* a discount/markup was set
(percent vs a flat amount, and the reason picked from the shared
`discount_reasons` dictionary) so the admin can redisplay/edit it. The money
columns (discount_total/markup_total/discount/markup) stay authoritative for
totals math either way; percent is display-only.

order_items gets the same pair (it already has `discount`/`markup` money
columns from 0011) so a per-line discount/markup can carry its own reason.

All new columns are nullable — existing rows keep working with everything
unset (meaning "no discount/markup was ever configured with a reason/percent").
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_order_discount_markup"
down_revision = "0013_order_delivery_comment"
branch_labels = None
depends_on = None

Percent = sa.Numeric(5, 2)


def upgrade() -> None:
    # batch_alter_table: SQLite can't ALTER-add a column with an inline FK
    # (same copy-and-move pattern as 0006_order_crm_fields / 0011_order_items).
    with op.batch_alter_table("orders") as b:
        b.add_column(
            sa.Column(
                "discount_reason_id",
                sa.String(),
                sa.ForeignKey("discount_reasons.id", name="fk_orders_discount_reason_id"),
                nullable=True,
            )
        )
        b.add_column(sa.Column("discount_percent", Percent, nullable=True))
        b.add_column(
            sa.Column(
                "markup_reason_id",
                sa.String(),
                sa.ForeignKey("discount_reasons.id", name="fk_orders_markup_reason_id"),
                nullable=True,
            )
        )
        b.add_column(sa.Column("markup_percent", Percent, nullable=True))

    with op.batch_alter_table("order_items") as b:
        b.add_column(
            sa.Column(
                "discount_reason_id",
                sa.String(),
                sa.ForeignKey("discount_reasons.id", name="fk_order_items_discount_reason_id"),
                nullable=True,
            )
        )
        b.add_column(sa.Column("discount_percent", Percent, nullable=True))
        b.add_column(
            sa.Column(
                "markup_reason_id",
                sa.String(),
                sa.ForeignKey("discount_reasons.id", name="fk_order_items_markup_reason_id"),
                nullable=True,
            )
        )
        b.add_column(sa.Column("markup_percent", Percent, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("order_items") as b:
        b.drop_column("markup_percent")
        b.drop_column("markup_reason_id")
        b.drop_column("discount_percent")
        b.drop_column("discount_reason_id")

    with op.batch_alter_table("orders") as b:
        b.drop_column("markup_percent")
        b.drop_column("markup_reason_id")
        b.drop_column("discount_percent")
        b.drop_column("discount_reason_id")
