"""enable RLS on all tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-25 00:00:00.000000

Enables Row-Level Security on every public table.
The application connects via a direct asyncpg connection using the
database superuser / service role, which bypasses RLS entirely, so
no permissive policies are needed. This blocks all direct PostgREST
/ anon-key access to the tables.
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = [
    "households",
    "users",
    "invitations",
    "stores",
    "products",
    "list_items",
    "pantry_items",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;")
        # Force RLS even for table owners (extra safety)
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY;")
    # Also lock down Alembic's own tracking table
    op.execute("ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} NO FORCE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
