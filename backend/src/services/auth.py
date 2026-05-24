from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, Request, Response, UploadFile, status
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError

from src.api.v1.dependencies.auth import RefreshAuthContext, get_client_ip
from src.api.v1.serializers import to_document_dto, to_user_profile
from src.config import settings
from src.models.auth import RefreshSession, User
from src.models.doctor import DoctorQualificationDocument, doctor_specializations
from src.models.enums import JwtTokenType, UserRole
from src.repos.loaders import USER_PROFILE_OPTIONS
from src.schemas.auth import (
    AuthTokenResponseDTO,
    LoginRequest,
    MessageResponseDTO,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    RegisterDoctorMetaRequest,
    RegisterPatientRequest,
    UserProfileDTO,
)
from src.schemas.doctor import DoctorQualificationDocumentDTO
from src.services.base import BaseService
from src.utils.files import build_avatar_url, delete_avatar_file, save_avatar_image, save_doctor_document
from src.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    generate_jti,
    hash_password,
    hash_token,
    utc_now,
    verify_password,
)


def _cleanup_files(file_names: list[str]) -> None:
    for file_name in file_names:
        (settings.upload.directory / file_name).unlink(missing_ok=True)


class TokenService(BaseService):
    @staticmethod
    def _set_refresh_cookie(response: Response, token: str, expires_at: datetime) -> None:
        response.set_cookie(
            key=settings.auth.refresh_cookie_name,
            value=token,
            httponly=True,
            secure=settings.auth.cookie_secure,
            samesite=settings.auth.cookie_samesite,
            max_age=int(settings.auth.refresh_ttl_days * 24 * 3600),
            expires=expires_at,
            path=settings.auth.refresh_cookie_path,
            domain=settings.auth.cookie_domain,
        )

    @staticmethod
    def clear_refresh_cookie(response: Response) -> None:
        response.delete_cookie(
            key=settings.auth.refresh_cookie_name,
            path=settings.auth.refresh_cookie_path,
            domain=settings.auth.cookie_domain,
        )

    async def issue_tokens(self, user: User, request: Request, response: Response) -> AuthTokenResponseDTO:
        access_token, access_expires = create_access_token(user.id, user.role)
        refresh_jti = generate_jti()
        refresh_token, refresh_expires = create_refresh_token(user.id, refresh_jti)

        self.db.refresh_sessions.add(
            RefreshSession(
                jti=refresh_jti,
                user_id=user.id,
                token_hash=hash_token(refresh_token),
                user_agent=(request.headers.get("user-agent") or "")[:512],
                ip_address=get_client_ip(request),
                expires_at=refresh_expires,
            )
        )
        await self.db.commit()

        self._set_refresh_cookie(response, refresh_token, refresh_expires)

        return AuthTokenResponseDTO(
            access_token=access_token,
            expires_in=max(int((access_expires - datetime.now(UTC)).total_seconds()), 1),
            user=to_user_profile(user),
        )


class AuthService(BaseService):
    async def register_patient(self, payload: RegisterPatientRequest) -> UserProfileDTO:
        existing_user = await self.db.users.get_by_username(payload.username)
        if existing_user is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

        user = User(
            username=payload.username,
            password_hash=hash_password(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            role=UserRole.PATIENT,
            is_verified_doctor=False,
        )
        self.db.add(user)
        await self.db.commit()

        created_user = await self.db.users.get_by_id(user.id, *USER_PROFILE_OPTIONS)
        if created_user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return to_user_profile(created_user)

    async def register_doctor(
        self,
        payload: RegisterDoctorMetaRequest,
        documents: list[UploadFile],
    ) -> UserProfileDTO:
        if not documents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="At least one qualification file is required"
            )
        if len(documents) > settings.upload.max_files_per_request:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {settings.upload.max_files_per_request} files per request",
            )

        existing_user = await self.db.users.get_by_username(payload.username)
        if existing_user is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

        specializations = await self.db.specializations.get_by_ids(payload.specialization_ids)
        if len(specializations) != len(payload.specialization_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="One or more specialization ids are invalid"
            )

        saved_file_names: list[str] = []
        try:
            user = User(
                username=payload.username,
                password_hash=hash_password(payload.password),
                first_name=payload.first_name,
                last_name=payload.last_name,
                role=UserRole.DOCTOR,
                is_verified_doctor=False,
            )
            self.db.add(user)
            await self.db.flush()
            await self.db.session.execute(
                insert(doctor_specializations),
                [{"doctor_id": user.id, "specialization_id": item.id} for item in specializations],
            )

            for upload in documents:
                file_meta = await save_doctor_document(upload)
                saved_file_names.append(file_meta.stored_file_name)
                self.db.documents.add(
                    DoctorQualificationDocument(
                        doctor_id=user.id,
                        original_file_name=file_meta.original_file_name,
                        stored_file_name=file_meta.stored_file_name,
                        content_type=file_meta.content_type,
                        size_bytes=file_meta.size_bytes,
                        sha256=file_meta.sha256,
                    )
                )

            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            _cleanup_files(saved_file_names)
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            _cleanup_files(saved_file_names)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Could not register doctor") from exc

        created_user = await self.db.users.get_by_id(user.id, *USER_PROFILE_OPTIONS)
        if created_user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return to_user_profile(created_user)

    async def login(self, payload: LoginRequest, request: Request, response: Response) -> AuthTokenResponseDTO:
        user = await self.db.users.get_by_username(payload.username, *USER_PROFILE_OPTIONS)
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        return await TokenService(self.db).issue_tokens(user=user, request=request, response=response)

    async def refresh_tokens(
        self,
        refresh_context: RefreshAuthContext,
        request: Request,
        response: Response,
    ) -> AuthTokenResponseDTO:
        refresh_context.refresh_session.revoked_at = utc_now()
        return await TokenService(self.db).issue_tokens(user=refresh_context.user, request=request, response=response)

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return

        try:
            payload = decode_jwt_token(refresh_token, JwtTokenType.REFRESH)
        except HTTPException:
            return

        jti = payload.get("jti")
        if not isinstance(jti, str):
            return

        refresh_session = await self.db.refresh_sessions.get_active_by_jti(jti)
        if refresh_session is None:
            return

        refresh_session.revoked_at = utc_now()
        await self.db.commit()

    async def touch_presence(self, refresh_context: RefreshAuthContext, request: Request) -> None:
        refresh_context.refresh_session.updated_at = utc_now()
        refresh_context.refresh_session.ip_address = get_client_ip(request)
        await self.db.commit()

    async def get_my_profile(self, current_user: User) -> UserProfileDTO:
        return to_user_profile(current_user)

    async def update_my_profile(self, payload: ProfileUpdateRequest, current_user: User) -> UserProfileDTO:
        current_user.first_name = payload.first_name if payload.first_name is not None else current_user.first_name
        current_user.last_name = payload.last_name if payload.last_name is not None else current_user.last_name
        await self.db.commit()

        user = await self.db.users.get_by_id(current_user.id, *USER_PROFILE_OPTIONS)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return to_user_profile(user)

    async def upload_my_avatar(self, current_user: User, avatar: UploadFile) -> UserProfileDTO:
        old_avatar_url = current_user.avatar_url
        file_meta = await save_avatar_image(avatar)
        new_avatar_url = build_avatar_url(file_meta.stored_file_name)

        current_user.avatar_url = new_avatar_url
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            delete_avatar_file(new_avatar_url)
            raise

        delete_avatar_file(old_avatar_url)

        user = await self.db.users.get_by_id(current_user.id, *USER_PROFILE_OPTIONS)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return to_user_profile(user)

    async def delete_my_avatar(self, current_user: User) -> UserProfileDTO:
        old_avatar_url = current_user.avatar_url
        current_user.avatar_url = None

        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        delete_avatar_file(old_avatar_url)

        user = await self.db.users.get_by_id(current_user.id, *USER_PROFILE_OPTIONS)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return to_user_profile(user)

    async def change_password(self, payload: PasswordChangeRequest, current_user: User) -> MessageResponseDTO:
        if not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

        current_user.password_hash = hash_password(payload.new_password)
        await self.db.commit()
        return MessageResponseDTO(detail="Password changed")

    async def get_my_documents(self, current_user: User) -> list[DoctorQualificationDocumentDTO]:
        if current_user.role != UserRole.DOCTOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Only doctors can view qualification documents"
            )
        documents = sorted(current_user.qualification_documents, key=lambda doc: doc.created_at, reverse=True)
        return [to_document_dto(item) for item in documents]
