"""add product_upcs table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-25 00:00:00.000000

Adds the product_upcs table that allows a product to have multiple known UPCs.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_upcs',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            'product_id',
            sa.Integer(),
            sa.ForeignKey('products.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('upc', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=False, server_default='manual'),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.UniqueConstraint('product_id', 'upc', name='uq_product_upcs_product_id_upc'),
    )

    op.create_index('ix_product_upcs_upc', 'product_upcs', ['upc'])

    # Enable and force RLS (consistent with c3d4e5f6a7b8)
    op.execute('ALTER TABLE public.product_upcs ENABLE ROW LEVEL SECURITY;')
    op.execute('ALTER TABLE public.product_upcs FORCE ROW LEVEL SECURITY;')


def downgrade() -> None:
    op.execute('ALTER TABLE public.product_upcs NO FORCE ROW LEVEL SECURITY;')
    op.execute('ALTER TABLE public.product_upcs DISABLE ROW LEVEL SECURITY;')
    op.drop_index('ix_product_upcs_upc', table_name='product_upcs')
    op.drop_table('product_upcs')
