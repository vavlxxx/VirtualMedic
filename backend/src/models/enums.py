from enum import Enum


class UserRole(str, Enum):
    SUPERUSER = "superuser"
    ADMIN = "admin"
    PATIENT = "patient"
    DOCTOR = "doctor"


class JwtTokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"


class QuestionFormat(str, Enum):
    PAID = "paid"
    FREE = "free"
