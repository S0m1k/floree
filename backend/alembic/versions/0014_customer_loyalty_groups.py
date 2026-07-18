"""customers: loyalty group assignment + bonus group change history

Revision ID: 0014_customer_loyalty_groups
Revises: 0013_order_delivery_comment
Create Date: 2026-07-18

Wires the already-modeled loyalty domain (bonus_groups/discount_groups from
0002_phase1_domain, app/loyalty_models.py) onto customers so the admin
«Клиенты и развитие → Система лояльности» screens (admin-map §2.5.4-2.5.6)
can assign a customer to a bonus/discount group, and adds
customer_bonus_group_history backing the «История изменения бонусных групп»
table on the customer card's «Бонусы» tab (columns per the live Posiflora UI:
Дата | Автор изменений | Старая бонусная группа | Новая бонусная группа —
worker_id NULL means «автоматически», written by
POST /v1/bonus-groups/recalculate).
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_customer_loyalty_groups"
down_revision = "0013_order_delivery_comment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table: SQLite can't ALTER-add a column with an inline FK
    # (same copy-and-move pattern as 0006_order_crm_fields / 0011_order_items
    # / 0012_specification_composition).
    with op.batch_alter_table("customers") as b:
        b.add_column(
            sa.Column(
                "bonus_group_id",
                sa.String(),
                sa.ForeignKey(
                    "bonus_groups.id", name="fk_customers_bonus_group_id", ondelete="SET NULL"
                ),
                nullable=True,
            )
        )
        b.add_column(
            sa.Column(
                "discount_group_id",
                sa.String(),
                sa.ForeignKey(
                    "discount_groups.id",
                    name="fk_customers_discount_group_id",
                    ondelete="SET NULL",
                ),
                nullable=True,
            )
        )

    op.create_table(
        "customer_bonus_group_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "customer_id",
            sa.String(),
            sa.ForeignKey("customers.id", name="fk_cbgh_customer_id"),
            nullable=False,
        ),
        sa.Column(
            "old_group_id",
            sa.String(),
            sa.ForeignKey(
                "bonus_groups.id", name="fk_cbgh_old_group_id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
        sa.Column(
            "new_group_id",
            sa.String(),
            sa.ForeignKey(
                "bonus_groups.id", name="fk_cbgh_new_group_id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
        sa.Column(
            "worker_id",
            sa.String(),
            sa.ForeignKey("workers.id", name="fk_cbgh_worker_id"),
            nullable=True,
        ),
        sa.Column("changed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("is_automatic", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_customer_bonus_group_history_customer_id",
        "customer_bonus_group_history",
        ["customer_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_customer_bonus_group_history_customer_id",
        table_name="customer_bonus_group_history",
    )
    op.drop_table("customer_bonus_group_history")

    with op.batch_alter_table("customers") as b:
        b.drop_column("discount_group_id")
        b.drop_column("bonus_group_id")
