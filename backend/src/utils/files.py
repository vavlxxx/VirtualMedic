from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from src.config import settings


@dataclass
class StoredFileMeta:
    original_file_name: str
    stored_file_name: str
    content_type: str
    size_bytes: int
    sha256: str


def ensure_upload_directory() -> Path:
    settings.upload.directory.mkdir(parents=True, exist_ok=True)
    return settings.upload.directory


def ensure_avatar_directory() -> Path:
    settings.upload.avatar_directory.mkdir(parents=True, exist_ok=True)
    return settings.upload.avatar_directory


def build_avatar_url(stored_file_name: str) -> str:
    file_name = Path(stored_file_name).name
    return f"{settings.app.api_prefix}{settings.app.v1_prefix}/auth/avatar/{file_name}"


async def _save_upload_file(
    upload_file: UploadFile,
    *,
    upload_dir: Path,
    allowed_extensions: set[str],
    allowed_mime_types: set[str],
    max_file_size_mb: int,
    empty_detail: str,
) -> StoredFileMeta:
    if not upload_file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file has no filename")

    original_name = Path(upload_file.filename).name
    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: .{extension}",
        )

    content_type = (upload_file.content_type or "application/octet-stream").lower()
    if content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type: {content_type}",
        )

    stored_file_name = f"{uuid4().hex}.{extension}"
    destination = upload_dir / stored_file_name

    max_size_bytes = max_file_size_mb * 1024 * 1024
    size_bytes = 0
    digest = hashlib.sha256()

    try:
        with destination.open("wb") as target:
            while True:
                chunk = await upload_file.read(1024 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > max_size_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds {max_file_size_mb} MB limit",
                    )
                digest.update(chunk)
                target.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await upload_file.close()

    if size_bytes == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=empty_detail)

    return StoredFileMeta(
        original_file_name=original_name,
        stored_file_name=stored_file_name,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=digest.hexdigest(),
    )


async def save_doctor_document(upload_file: UploadFile) -> StoredFileMeta:
    return await _save_upload_file(
        upload_file,
        upload_dir=ensure_upload_directory(),
        allowed_extensions=settings.upload.allowed_extensions,
        allowed_mime_types=settings.upload.allowed_mime_types,
        max_file_size_mb=settings.upload.max_file_size_mb,
        empty_detail="Empty files are not allowed",
    )


async def save_avatar_image(upload_file: UploadFile) -> StoredFileMeta:
    return await _save_upload_file(
        upload_file,
        upload_dir=ensure_avatar_directory(),
        allowed_extensions=settings.upload.avatar_allowed_extensions,
        allowed_mime_types=settings.upload.avatar_allowed_mime_types,
        max_file_size_mb=settings.upload.avatar_max_file_size_mb,
        empty_detail="Avatar image is empty",
    )


def resolve_document_path(stored_file_name: str) -> Path:
    file_name = Path(stored_file_name).name
    path = settings.upload.directory / file_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found")
    return path


def resolve_avatar_path(stored_file_name: str) -> Path:
    file_name = Path(stored_file_name).name
    path = settings.upload.avatar_directory / file_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar file not found")
    return path


def delete_avatar_file(avatar_url: str | None) -> None:
    if not avatar_url:
        return

    avatar_prefix = f"{settings.app.api_prefix}{settings.app.v1_prefix}/auth/avatar/"
    if not avatar_url.startswith(avatar_prefix):
        return

    file_name = Path(avatar_url.removeprefix(avatar_prefix)).name
    if not file_name:
        return

    (settings.upload.avatar_directory / file_name).unlink(missing_ok=True)
