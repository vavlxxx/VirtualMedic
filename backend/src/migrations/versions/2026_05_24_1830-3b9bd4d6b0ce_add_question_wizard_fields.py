"""add question wizard fields

Revision ID: 3b9bd4d6b0ce
Revises: 6d43758e4cb3
Create Date: 2026-05-24 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3b9bd4d6b0ce"
down_revision: str | Sequence[str] | None = "6d43758e4cb3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("specialization_id", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("short_problem", sa.String(length=300), nullable=True))
    op.add_column("questions", sa.Column("details", sa.Text(), nullable=True))
    op.add_column("questions", sa.Column("question_format", sa.String(length=16), nullable=True))
    op.add_column("questions", sa.Column("price_rub", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("is_paid_mock", sa.Boolean(), nullable=True))
    op.add_column("questions", sa.Column("queue_position_at_submit", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("promo_code", sa.String(length=120), nullable=True))
    op.add_column("questions", sa.Column("patient_name", sa.String(length=120), nullable=True))
    op.add_column("questions", sa.Column("patient_age", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("chronic_conditions", sa.Text(), nullable=True))
    op.add_column("questions", sa.Column("contact_email", sa.String(length=320), nullable=True))
    op.add_column("questions", sa.Column("consent_terms", sa.Boolean(), nullable=True))
    op.add_column("questions", sa.Column("consent_marketing", sa.Boolean(), nullable=True))
    op.add_column("questions", sa.Column("source", sa.String(length=80), nullable=True))

    op.create_index(op.f("ix_questions_specialization_id"), "questions", ["specialization_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_questions_specialization_id_specializations"),
        "questions",
        "specializations",
        ["specialization_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_questions_specialization_id_specializations"), "questions", type_="foreignkey")
    op.drop_index(op.f("ix_questions_specialization_id"), table_name="questions")

    op.drop_column("questions", "source")
    op.drop_column("questions", "consent_marketing")
    op.drop_column("questions", "consent_terms")
    op.drop_column("questions", "contact_email")
    op.drop_column("questions", "chronic_conditions")
    op.drop_column("questions", "patient_age")
    op.drop_column("questions", "patient_name")
    op.drop_column("questions", "promo_code")
    op.drop_column("questions", "queue_position_at_submit")
    op.drop_column("questions", "is_paid_mock")
    op.drop_column("questions", "price_rub")
    op.drop_column("questions", "question_format")
    op.drop_column("questions", "details")
    op.drop_column("questions", "short_problem")
    op.drop_column("questions", "specialization_id")
