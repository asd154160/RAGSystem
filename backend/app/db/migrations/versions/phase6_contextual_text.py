"""Phase 6 migration: add contextual_text column to chunks

Revision ID: phase6_contextual_text
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'phase6_contextual_text'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chunks', sa.Column('contextual_text', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('chunks', 'contextual_text')
