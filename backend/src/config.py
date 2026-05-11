from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

BASE_DIR = Path(__file__).resolve().parent.parent


class DbSettings(BaseModel):
    host: str
    port: int
    user: str
    password: SecretStr
    name: str
    name_test: str = "virtualmedic_test"
    echo: bool = False
    alembic_host: str | None = None
    alembic_port: int | None = None

    def _build_async_url(self, *, host: str, port: int) -> URL:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.user,
            password=self.password.get_secret_value(),
            host=host,
            port=port,
            database=self.name,
        )

    @property
    def async_url(self) -> URL:
        return self._build_async_url(host=self.host, port=self.port)

    @property
    def alembic_async_url(self) -> URL:
        return self._build_async_url(
            host=self.alembic_host or self.host,
            port=self.alembic_port or self.port,
        )


class AppSettings(BaseModel):
    title: str = "VirtualMedic API"
    mode: Literal["DEV", "TEST", "PROD"] = "DEV"
    api_prefix: str = "/api"
    v1_prefix: str = "/v1"
    docs_url: str | None = "/docs"
    redoc_url: str | None = "/redoc"
    openapi_url: str | None = "/openapi.json"

    @field_validator("docs_url", "redoc_url", "openapi_url", mode="before")
    @classmethod
    def normalize_optional_docs_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.strip().lower() in {"", "none", "null"}:
            return None
        return value


class JwtSettings(BaseModel):
    secret_key: SecretStr
    algorithm: str = "HS256"
    access_ttl_minutes: int = 15
    refresh_ttl_days: int = 30
    issuer: str = "virtualmedic-backend"
    audience: str = "virtualmedic-frontend"
    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_path: str = "/api/v1/auth"
    online_status_ttl_seconds: int = 90
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None


class CorsSettings(BaseModel):
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    allow_credentials: bool = True
    allow_methods: list[str] = Field(default_factory=lambda: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    allow_headers: list[str] = Field(default_factory=lambda: ["Authorization", "Content-Type", "X-Requested-With"])

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


class UploadSettings(BaseModel):
    directory: Path = BASE_DIR / "uploads" / "doctor_documents"
    avatar_directory: Path = BASE_DIR / "uploads" / "avatars"
    max_file_size_mb: int = 8
    avatar_max_file_size_mb: int = 2
    max_files_per_request: int = 10
    allowed_extensions: set[str] = {"pdf", "png", "jpg", "jpeg", "webp"}
    allowed_mime_types: set[str] = {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
    }
    avatar_allowed_extensions: set[str] = {"png", "jpg", "jpeg", "webp"}
    avatar_allowed_mime_types: set[str] = {"image/png", "image/jpeg", "image/webp"}

    @field_validator(
        "allowed_extensions",
        "allowed_mime_types",
        "avatar_allowed_extensions",
        "avatar_allowed_mime_types",
        mode="before",
    )
    @classmethod
    def parse_collection(cls, value: set[str] | list[str] | str) -> set[str]:
        if isinstance(value, str):
            return {item.strip().lower() for item in value.split(",") if item.strip()}
        return {item.lower() for item in value}


class GunicornSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    timeout: int = 120
    worker_class: str = "uvicorn.workers.UvicornWorker"
    access_log: str | None = "-"
    error_log: str | None = "-"
    reload: bool = False


class UvicornSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False


class BootstrapSettings(BaseModel):
    superuser_username: str | None = None
    superuser_password: SecretStr | None = None
    superuser_first_name: str | None = "System"
    superuser_last_name: str | None = "Administrator"


class Settings(BaseSettings):
    db: DbSettings
    app: AppSettings = AppSettings()
    auth: JwtSettings
    cors: CorsSettings = CorsSettings()
    upload: UploadSettings = UploadSettings()
    gunicorn: GunicornSettings = GunicornSettings()
    uvicorn: UvicornSettings = UvicornSettings()
    bootstrap: BootstrapSettings = BootstrapSettings()

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_prefix="CFG_",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def validate_security(self) -> "Settings":
        if self.app.mode == "PROD":
            secret_value = self.auth.secret_key.get_secret_value()
            if (
                secret_value == "change-me-please-in-prod-very-long-secret"
                or "change-me" in secret_value.lower()
                or "dev-only" in secret_value.lower()
            ):
                raise ValueError("Set a strong CFG_AUTH__SECRET_KEY for PROD mode")
            if not self.auth.cookie_secure:
                raise ValueError("CFG_AUTH__COOKIE_SECURE must be true for PROD mode")
            if not self.cors.allowed_origins:
                raise ValueError("CFG_CORS__ALLOWED_ORIGINS must contain at least one frontend origin for PROD mode")
            invalid_origins = [
                origin
                for origin in self.cors.allowed_origins
                if (urlparse(origin).hostname or "").lower() in {"localhost", "127.0.0.1", "0.0.0.0"}
            ]
            if invalid_origins:
                raise ValueError("CFG_CORS__ALLOWED_ORIGINS must not contain localhost origins in PROD mode")
            if any(value is not None for value in (self.app.docs_url, self.app.redoc_url, self.app.openapi_url)):
                raise ValueError("Disable API docs and OpenAPI endpoints in PROD mode")
        return self


def load_settings(**overrides: Any) -> Settings:
    return Settings(**overrides)


settings = load_settings()
