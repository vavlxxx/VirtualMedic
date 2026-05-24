import re
from typing import Any

from pydantic import Field, field_validator, model_validator

from src.models.enums import UserRole
from src.schemas.base import BaseDTO

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]{4,64}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$")


def normalize_username(username: str) -> str:
    username = username.strip().lower()
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("Username must be 4-64 chars and contain only letters, numbers, '.', '_' or '-'.")
    return username


def validate_password(password: str) -> str:
    if not PASSWORD_PATTERN.fullmatch(password):
        raise ValueError("Password must be 10-128 chars and include upper, lower, digit and special character.")
    return password


def normalize_optional_name(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class LoginRequest(BaseDTO):
    username: str = Field(min_length=4, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username_field(cls, value: str) -> str:
        return normalize_username(value)


class RegisterPatientRequest(BaseDTO):
    username: str = Field(min_length=4, max_length=64)
    password: str = Field(min_length=10, max_length=128)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)

    @field_validator("username")
    @classmethod
    def normalize_username_field(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("password")
    @classmethod
    def validate_password_field(cls, value: str) -> str:
        return validate_password(value)

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_name_fields(cls, value: str | None) -> str | None:
        return normalize_optional_name(value)


class RegisterDoctorMetaRequest(RegisterPatientRequest):
    specialization_ids: list[int] = Field(min_length=1, max_length=20)

    @field_validator("specialization_ids")
    @classmethod
    def unique_specialization_ids(cls, value: list[int]) -> list[int]:
        unique_ids = list(dict.fromkeys(value))
        if len(unique_ids) != len(value):
            raise ValueError("specialization_ids must contain unique values")
        if any(item <= 0 for item in unique_ids):
            raise ValueError("specialization_ids must contain only positive ids")
        return unique_ids


class ProfileUpdateRequest(BaseDTO):
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_name_fields(cls, value: str | None) -> str | None:
        return normalize_optional_name(value)

    @model_validator(mode="before")
    @classmethod
    def ensure_any_field(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if not any(value is not None and str(value).strip() for value in data.values()):
            raise ValueError("Provide at least one profile field")
        return data


class PasswordChangeRequest(BaseDTO):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_field(cls, value: str) -> str:
        return validate_password(value)


class SpecializationInlineDTO(BaseDTO):
    id: int
    name: str


class UserProfileDTO(BaseDTO):
    id: int
    username: str
    role: UserRole
    first_name: str | None
    last_name: str | None
    avatar_url: str | None = None
    is_active: bool
    is_verified_doctor: bool
    specializations: list[SpecializationInlineDTO] = Field(default_factory=list)
    qualification_documents_count: int = 0


class AuthTokenResponseDTO(BaseDTO):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfileDTO


class MessageResponseDTO(BaseDTO):
    detail: str
