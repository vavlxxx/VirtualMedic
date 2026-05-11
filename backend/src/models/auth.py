from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base
from src.models.enums import UserRole

if TYPE_CHECKING:
    from src.models.doctor import DoctorQualificationDocument, Specialization
    from src.models.qa import Question, QuestionComment


def _user_role_values(enum_cls: type[UserRole]) -> list[str]:
    return [item.value for item in enum_cls]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=_user_role_values),
        default=UserRole.PATIENT,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified_doctor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    refresh_sessions: Mapped[list[RefreshSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    specializations: Mapped[list[Specialization]] = relationship(
        secondary="doctor_specializations",
        back_populates="doctors",
    )
    qualification_documents: Mapped[list[DoctorQualificationDocument]] = relationship(
        back_populates="doctor",
        cascade="all, delete-orphan",
    )
    questions: Mapped[list[Question]] = relationship(back_populates="author", cascade="all, delete-orphan")
    comments: Mapped[list[QuestionComment]] = relationship(back_populates="author", cascade="all, delete-orphan")


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    jti: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="refresh_sessions")

    __table_args__ = (Index("ix_refresh_sessions_user_revoked", "user_id", "revoked_at"),)
