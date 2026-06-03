"""initial

Revision ID: 7b122c0079f6
Revises:
Create Date: 2026-06-03 01:20:48.732584
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7b122c0079f6'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
