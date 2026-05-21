"""initial schema

Revision ID: 761437ed2ce2
Revises: 
Create Date: 2026-05-20 15:46:21.596307

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '761437ed2ce2'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables for the initial Grocery Getter schema."""

    # ------------------------------------------------------------------
    # households — no foreign-key dependencies, created first
    # ------------------------------------------------------------------
    op.create_table(
        "households",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ------------------------------------------------------------------
    # users — references households
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["household_id"],
            ["households.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("email"),
    )

    # ------------------------------------------------------------------
    # invitations — references households (CASCADE on delete)
    # ------------------------------------------------------------------
    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column(
            "used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["household_id"],
            ["households.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("token"),
    )

    # ------------------------------------------------------------------
    # stores — references households (CASCADE on delete)
    # ------------------------------------------------------------------
    op.create_table(
        "stores",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["household_id"],
            ["households.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("household_id", "name"),
    )

    # ------------------------------------------------------------------
    # products — references households (CASCADE) and stores (SET NULL)
    # ------------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("upc", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Text(), nullable=True),
        sa.Column("store_id", sa.Integer(), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["household_id"],
            ["households.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["store_id"],
            ["stores.id"],
            ondelete="SET NULL",
        ),
    )

    # ------------------------------------------------------------------
    # list_items — references households (CASCADE), products (CASCADE),
    #              and stores (SET NULL)
    # ------------------------------------------------------------------
    op.create_table(
        "list_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=True),
        sa.Column(
            "quantity",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "checked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["household_id"],
            ["households.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["store_id"],
            ["stores.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("household_id", "product_id"),
    )


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.drop_table("list_items")
    op.drop_table("products")
    op.drop_table("stores")
    op.drop_table("invitations")
    op.drop_table("users")
    op.drop_table("households")
