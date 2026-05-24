from pathlib import Path
from urllib.parse import urlparse

import pytest
from httpx import AsyncClient

from src.config import settings


async def _register_and_login_patient(ac: AsyncClient, username: str, password: str) -> str:
    register = await ac.post(
        "/auth/register/patient",
        json={
            "username": username,
            "password": password,
            "first_name": "Avatar",
            "last_name": "Owner",
        },
    )
    assert register.status_code == 201

    login = await ac.post("/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def _avatar_path_from_url(avatar_url: str) -> Path:
    return settings.upload.avatar_directory / Path(urlparse(avatar_url).path).name


@pytest.mark.asyncio
async def test_register_patient_and_duplicate_username(ac: AsyncClient) -> None:
    payload = {
        "username": "patient_001",
        "password": "StrongPass!123",
        "first_name": "Ivan",
        "last_name": "Petrov",
    }

    response = await ac.post("/auth/register/patient", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == payload["username"]
    assert body["role"] == "patient"

    duplicate = await ac.post("/auth/register/patient", json=payload)
    assert duplicate.status_code == 409


@pytest.mark.asyncio
async def test_login_me_refresh_logout_flow(ac: AsyncClient) -> None:
    register_payload = {
        "username": "patient_002",
        "password": "StrongPass!123",
        "first_name": "Alex",
        "last_name": "Ivanov",
    }
    register = await ac.post("/auth/register/patient", json=register_payload)
    assert register.status_code == 201

    login = await ac.post(
        "/auth/login",
        json={
            "username": register_payload["username"],
            "password": register_payload["password"],
        },
    )
    assert login.status_code == 200
    login_body = login.json()
    assert login_body["access_token"]
    assert login_body["token_type"] == "bearer"

    access_token = login_body["access_token"]
    me = await ac.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["username"] == register_payload["username"]

    refresh = await ac.post("/auth/refresh")
    assert refresh.status_code == 200
    refresh_body = refresh.json()
    assert refresh_body["access_token"]

    logout = await ac.post("/auth/logout")
    assert logout.status_code == 204

    refresh_after_logout = await ac.post("/auth/refresh")
    assert refresh_after_logout.status_code == 401


@pytest.mark.asyncio
async def test_avatar_upload_replace_and_delete_keeps_single_file(ac: AsyncClient) -> None:
    access_token = await _register_and_login_patient(ac, "patient_avatar", "StrongPass!123")
    headers = {"Authorization": f"Bearer {access_token}"}

    first_upload = await ac.post(
        "/auth/me/avatar",
        headers=headers,
        files={"avatar": ("avatar.png", b"first-avatar", "image/png")},
    )
    assert first_upload.status_code == 200
    first_avatar_url = first_upload.json()["avatar_url"]
    first_avatar_path = _avatar_path_from_url(first_avatar_url)
    assert first_avatar_path.exists()

    served_avatar = await ac.get(f"http://test{first_avatar_url}")
    assert served_avatar.status_code == 200
    assert served_avatar.content == b"first-avatar"

    second_upload = await ac.post(
        "/auth/me/avatar",
        headers=headers,
        files={"avatar": ("avatar.webp", b"second-avatar", "image/webp")},
    )
    assert second_upload.status_code == 200
    second_avatar_url = second_upload.json()["avatar_url"]
    second_avatar_path = _avatar_path_from_url(second_avatar_url)

    assert second_avatar_url != first_avatar_url
    assert not first_avatar_path.exists()
    assert second_avatar_path.exists()

    delete_avatar = await ac.delete("/auth/me/avatar", headers=headers)
    assert delete_avatar.status_code == 200
    assert delete_avatar.json()["avatar_url"] is None
    assert not second_avatar_path.exists()
