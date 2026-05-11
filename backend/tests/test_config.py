import pytest
from pydantic import SecretStr

from src.config import AppSettings, CorsSettings, DbSettings, JwtSettings, Settings


def make_prod_settings(**overrides) -> Settings:
    payload = {
        "app": AppSettings(
            mode="PROD",
            docs_url=None,
            redoc_url=None,
            openapi_url=None,
        ),
        "db": DbSettings(
            host="postgres",
            port=5432,
            user="postgres",
            password=SecretStr("LocalTestDbPassword!123"),
            name="virtualmedic",
        ),
        "auth": JwtSettings(
            secret_key=SecretStr("ProdSecret!1234567890"),
            cookie_secure=True,
        ),
        "cors": CorsSettings(
            allowed_origins=["https://app.virtualmedic.example"],
        ),
    }
    payload.update(overrides)
    return Settings(**payload)


def test_prod_settings_accept_secure_configuration() -> None:
    settings = make_prod_settings()
    assert settings.app.mode == "PROD"
    assert settings.auth.cookie_secure is True
    assert settings.cors.allowed_origins == ["https://app.virtualmedic.example"]


@pytest.mark.parametrize(
    ("secret_key", "expected_message"),
    [
        ("change-me-please-in-prod-very-long-secret", "CFG_AUTH__SECRET_KEY"),
        ("dev-only-change-me-super-secret-key-1234567890", "CFG_AUTH__SECRET_KEY"),
    ],
)
def test_prod_settings_reject_weak_or_dev_secret(secret_key: str, expected_message: str) -> None:
    with pytest.raises(ValueError, match=expected_message):
        make_prod_settings(auth=JwtSettings(secret_key=SecretStr(secret_key), cookie_secure=True))


def test_prod_settings_require_secure_cookie() -> None:
    with pytest.raises(ValueError, match="CFG_AUTH__COOKIE_SECURE"):
        make_prod_settings(auth=JwtSettings(secret_key=SecretStr("ProdSecret!1234567890"), cookie_secure=False))


def test_prod_settings_reject_localhost_cors_origins() -> None:
    with pytest.raises(ValueError, match="CFG_CORS__ALLOWED_ORIGINS"):
        make_prod_settings(cors=CorsSettings(allowed_origins=["http://localhost:5173"]))


def test_prod_settings_require_docs_to_be_disabled() -> None:
    with pytest.raises(ValueError, match="Disable API docs"):
        make_prod_settings(app=AppSettings(mode="PROD"))


def test_prod_settings_accept_blank_or_null_docs_values_from_env_style_input() -> None:
    settings = make_prod_settings(
        app=AppSettings(
            mode="PROD",
            docs_url="",
            redoc_url="null",
            openapi_url="none",
        )
    )
    assert settings.app.docs_url is None
    assert settings.app.redoc_url is None
    assert settings.app.openapi_url is None


def test_db_settings_allow_separate_alembic_connection_target() -> None:
    settings = DbSettings(
        host="postgres",
        port=5432,
        user="postgres",
        password=SecretStr("LocalTestDbPassword!123"),
        name="virtualmedic",
        alembic_host="localhost",
        alembic_port=6432,
    )

    assert settings.async_url.host == "postgres"
    assert settings.async_url.port == 5432
    assert settings.alembic_async_url.host == "localhost"
    assert settings.alembic_async_url.port == 6432
