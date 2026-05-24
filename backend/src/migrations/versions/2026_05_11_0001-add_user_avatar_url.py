"""add user avatar url

Revision ID: add_user_avatar_url
Revises: 6d43758e4cb3
Create Date: 2026-05-11 00:01:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_user_avatar_url"
down_revision: str | None = "6d43758e4cb3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
