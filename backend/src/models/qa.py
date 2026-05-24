from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.auth import User


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    text: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    specialization_id: Mapped[int | None] = mapped_column(
        ForeignKey("specializations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    short_problem: Mapped[str | None] = mapped_column(String(300), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_format: Mapped[str | None] = mapped_column(String(16), nullable=True)
    price_rub: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_paid_mock: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    queue_position_at_submit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    promo_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    patient_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    patient_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chronic_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    consent_terms: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    consent_marketing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)

    author: Mapped[User] = relationship(back_populates="questions")
    comments: Mapped[list[QuestionComment]] = relationship(back_populates="question", cascade="all, delete-orphan")


class QuestionComment(Base):
    __tablename__ = "question_comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    text: Mapped[str] = mapped_column(String(2000))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    question: Mapped[Question] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(back_populates="comments")
