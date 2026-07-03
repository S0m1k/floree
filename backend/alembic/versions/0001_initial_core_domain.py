"""initial core domain: orders/payments + catalog (Phase 1)

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-01

Creates every table the clone needs on a fresh database:
orders + payments (existing flow) and the Phase 1 catalog/customer domain
(stores, images, categories, specifications + variants + SWV + variant prices,
bouquets, customers).
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stores",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("timezone", sa.String(), nullable=False, server_default="Europe/Moscow"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "images",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("hash", sa.String(), nullable=True),
        sa.Column("file", sa.String(), nullable=True),
        sa.Column("file_small", sa.String(), nullable=True),
        sa.Column("file_medium", sa.String(), nullable=True),
        sa.Column("file_shop", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=True),
        sa.Column("group_id", sa.String(), nullable=True),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="on"),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "specifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="on"),
        sa.Column("public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("min_price", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_price", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_url", sa.String(), nullable=True),
        sa.Column("category_id", sa.String(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("logo_id", sa.String(), sa.ForeignKey("images.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "specification_variants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
    )

    op.create_table(
        "specification_with_variants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("specification_id", sa.String(), sa.ForeignKey("specifications.id"), nullable=False),
        sa.Column("variant_id", sa.String(), sa.ForeignKey("specification_variants.id"), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(), nullable=False, server_default="on"),
    )

    op.create_table(
        "specification_variant_prices",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("spec_with_variants_id", sa.String(), sa.ForeignKey("specification_with_variants.id"), nullable=False),
        sa.Column("price_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="on"),
    )

    op.create_table(
        "bouquets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sale_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("store_id", sa.String(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("spec_with_variants_id", sa.String(), sa.ForeignKey("specification_with_variants.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "customers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=False, index=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("bonus_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("posiflora_id", sa.String(), nullable=True),
        sa.Column("posiflora_doc_no", sa.String(), nullable=True),
        sa.Column("customer_name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("due_time", sa.String(), nullable=True),
        sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("bouquet_ids", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("tbank_payment_id", sa.String(), nullable=True),
        sa.Column("tbank_order_id", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="INIT"),
        sa.Column("payment_url", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("orders")
    op.drop_table("customers")
    op.drop_table("bouquets")
    op.drop_table("specification_variant_prices")
    op.drop_table("specification_with_variants")
    op.drop_table("specification_variants")
    op.drop_table("specifications")
    op.drop_table("categories")
    op.drop_table("images")
    op.drop_table("stores")
