from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import EmailStr, Field, field_validator, model_validator

from src.models.enums import UserRole
from src.schemas.base import BaseDTO


class QuestionFormatDTO(str, Enum):
    PAID = "paid"
    FREE = "free"


class QuestionCreateDTO(BaseDTO):
    text: str | None = Field(default=None, min_length=10, max_length=4000)
    specialization_id: int | None = Field(default=None, ge=1)
    short_problem: str | None = Field(default=None, min_length=2, max_length=300)
    details: str | None = Field(default=None, min_length=10, max_length=7500)
    question_format: QuestionFormatDTO | None = None
    price_rub: int | None = Field(default=None, ge=749, le=500_000)
    is_paid_mock: bool | None = None
    queue_position_at_submit: int | None = Field(default=None, ge=0)
    promo_code: str | None = Field(default=None, max_length=120)
    patient_name: str | None = Field(default=None, max_length=120)
    patient_age: int | None = Field(default=None, ge=0, le=120)
    chronic_conditions: str | None = Field(default=None, max_length=2000)
    contact_email: EmailStr | None = None
    consent_terms: bool | None = None
    consent_marketing: bool | None = None
    source: str | None = Field(default=None, max_length=80)

    @field_validator(
        "text",
        "short_problem",
        "details",
        "promo_code",
        "patient_name",
        "chronic_conditions",
        "source",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_wizard_constraints(self):
        has_wizard_data = any(
            (
                self.specialization_id,
                self.short_problem,
                self.details,
                self.question_format,
                self.patient_name,
                self.contact_email,
                self.patient_age is not None,
                self.consent_terms is not None,
                self.consent_marketing is not None,
                self.price_rub is not None,
                self.promo_code,
                self.source,
            )
        )

        if not self.text and not self.details and not self.short_problem:
            raise ValueError("Provide question text or wizard details")

        if self.question_format == QuestionFormatDTO.PAID:
            if self.price_rub is None:
                raise ValueError("price_rub is required for paid format")
            if self.is_paid_mock is not True:
                raise ValueError("is_paid_mock must be true for paid format in current flow")

        if self.question_format == QuestionFormatDTO.FREE and self.price_rub is not None:
            raise ValueError("price_rub must be omitted for free format")

        if has_wizard_data:
            if not self.specialization_id:
                raise ValueError("specialization_id is required for wizard payload")
            if not self.short_problem:
                raise ValueError("short_problem is required for wizard payload")
            if not self.details:
                raise ValueError("details is required for wizard payload")
            if self.question_format is None:
                raise ValueError("question_format is required for wizard payload")
            if not self.patient_name:
                raise ValueError("patient_name is required for wizard payload")
            if self.patient_age is None:
                raise ValueError("patient_age is required for wizard payload")
            if self.contact_email is None:
                raise ValueError("contact_email is required for wizard payload")
            if self.consent_terms is not True:
                raise ValueError("consent_terms must be accepted")
            if self.consent_marketing is None:
                raise ValueError("consent_marketing is required for wizard payload")

        return self


class FreeQueueStatusDTO(BaseDTO):
    pending_count: int


class QuestionCommentCreateDTO(BaseDTO):
    text: str = Field(min_length=2, max_length=2000)


class UserShortDTO(BaseDTO):
    id: int
    username: str
    role: UserRole
    first_name: str | None
    last_name: str | None
    is_verified_doctor: bool


class QuestionCommentDTO(BaseDTO):
    id: int
    text: str
    created_at: datetime
    author: UserShortDTO


class QuestionDTO(BaseDTO):
    id: int
    text: str
    created_at: datetime
    author: UserShortDTO
    specialization_id: int | None = None
    short_problem: str | None = None
    details: str | None = None
    question_format: QuestionFormatDTO | None = None
    price_rub: int | None = None
    is_paid_mock: bool | None = None
    queue_position_at_submit: int | None = None
    promo_code: str | None = None
    patient_name: str | None = None
    patient_age: int | None = None
    chronic_conditions: str | None = None
    contact_email: str | None = None
    consent_terms: bool | None = None
    consent_marketing: bool | None = None
    source: str | None = None
    comments: list[QuestionCommentDTO] = Field(default_factory=list)
