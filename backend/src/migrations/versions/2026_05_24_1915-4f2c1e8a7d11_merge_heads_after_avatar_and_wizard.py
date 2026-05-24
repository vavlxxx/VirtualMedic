"""merge heads after avatar and question wizard migrations

Revision ID: 4f2c1e8a7d11
Revises: add_user_avatar_url, 3b9bd4d6b0ce
Create Date: 2026-05-24 19:15:00.000000
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "4f2c1e8a7d11"
down_revision: str | Sequence[str] | None = ("add_user_avatar_url", "3b9bd4d6b0ce")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Merge migration: schema changes were already applied in parent heads.
    pass


def downgrade() -> None:
    # No-op: splitting merged heads is not required for rollback in this project.
    pass
