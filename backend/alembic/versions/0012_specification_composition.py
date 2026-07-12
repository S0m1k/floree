"""specification composition + recipe author/tags + per-store variant prices

Revision ID: 0012_specification_composition
Revises: 0011_order_items
Create Date: 2026-07-12

Backs the recipe card /admin/specifications/{id} (admin-map.md §2.3.2):

- `specification_compositions` — the flower/goods composition of a recipe
  variant («Состав варианта рецепта» modal). Priced on read from
  Item.max_price; nothing here is a price snapshot.
- `specifications` gains `author_id` (АВТОР select) and `tags_json` (ВЫБРАТЬ
  ТЕГИ multiselect, JSON list of recipe-tag ids — our own extension, same
  pattern as Worker.access_rights).
- `specification_variant_prices` gains `store_id` (per-point price override,
  «Активность на точках»); `price_value` becomes nullable — NULL there means
  «по цене состава» (fall back to the variant's composition total).
- `specification_images` — recipe photo gallery, added by URL (no file-upload
  pipeline yet). `specifications.logo_id` marks the «Основное фото».

All added columns are nullable so existing rows are untouched.
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_specification_composition"
down_revision = "0011_order_items"
branch_labels = None
depends_on = None

Qty = sa.Numeric(12, 3)


def upgrade() -> None:
    op.create_table(
        "specification_compositions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "spec_with_variants_id",
            sa.String(),
            sa.ForeignKey("specification_with_variants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("item_id", sa.String(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("quantity", Qty, nullable=False, server_default="0"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "specification_images",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "specification_id",
            sa.String(),
            sa.ForeignKey("specifications.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("image_id", sa.String(), sa.ForeignKey("images.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )

    # batch_alter_table: SQLite can't ALTER-add a column with an inline FK
    # (same copy-and-move pattern as 0006_order_crm_fields / 0011_order_items).
    with op.batch_alter_table("specifications") as b:
        b.add_column(
            sa.Column(
                "author_id",
                sa.String(),
                sa.ForeignKey("workers.id", name="fk_specifications_author_id"),
                nullable=True,
            )
        )
        b.add_column(sa.Column("tags_json", sa.Text(), nullable=True))

    with op.batch_alter_table("specification_variant_prices") as b:
        b.add_column(
            sa.Column(
                "store_id",
                sa.String(),
                sa.ForeignKey("stores.id", name="fk_specification_variant_prices_store_id"),
                nullable=True,
            )
        )
        b.alter_column("price_value", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("specification_variant_prices") as b:
        b.alter_column("price_value", existing_type=sa.Integer(), nullable=False, server_default="0")
        b.drop_column("store_id")

    with op.batch_alter_table("specifications") as b:
        b.drop_column("tags_json")
        b.drop_column("author_id")

    op.drop_table("specification_images")  # drops its index with it
    op.drop_table("specification_compositions")  # drops its index with it
