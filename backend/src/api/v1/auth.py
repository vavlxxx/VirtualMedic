from fastapi import APIRouter, File, Form, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError

from src.api.v1.dependencies.auth import CurrentUserDep, RefreshContextDep
from src.api.v1.dependencies.db import DBDep
from src.config import settings
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
from src.services.auth import AuthService, TokenService
from src.utils.files import resolve_avatar_path

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register/patient", response_model=UserProfileDTO, status_code=status.HTTP_201_CREATED)
async def register_patient(payload: RegisterPatientRequest, db: DBDep) -> UserProfileDTO:
    return await AuthService(db).register_patient(payload)


@router.post("/register/doctor", response_model=UserProfileDTO, status_code=status.HTTP_201_CREATED)
async def register_doctor(
    db: DBDep,
    username: str = Form(...),
    password: str = Form(...),
    first_name: str | None = Form(default=None),
    last_name: str | None = Form(default=None),
    specialization_ids: list[int] = Form(...),
    documents: list[UploadFile] = File(...),
) -> UserProfileDTO:
    try:
        payload = RegisterDoctorMetaRequest(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            specialization_ids=specialization_ids,
        )
    except ValidationError as exc:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    return await AuthService(db).register_doctor(payload=payload, documents=documents)


@router.post("/login", response_model=AuthTokenResponseDTO)
async def login(payload: LoginRequest, db: DBDep, request: Request, response: Response) -> AuthTokenResponseDTO:
    return await AuthService(db).login(payload=payload, request=request, response=response)


@router.post("/refresh", response_model=AuthTokenResponseDTO)
async def refresh_tokens(
    db: DBDep,
    response: Response,
    request: Request,
    refresh_context: RefreshContextDep,
) -> AuthTokenResponseDTO:
    return await AuthService(db).refresh_tokens(
        refresh_context=refresh_context,
        request=request,
        response=response,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(db: DBDep, request: Request) -> Response:
    await AuthService(db).logout(request.cookies.get(settings.auth.refresh_cookie_name))

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    TokenService.clear_refresh_cookie(response)
    return response


@router.post("/presence", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def touch_presence(db: DBDep, request: Request, refresh_context: RefreshContextDep) -> Response:
    await AuthService(db).touch_presence(refresh_context=refresh_context, request=request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserProfileDTO)
async def get_my_profile(db: DBDep, current_user: CurrentUserDep) -> UserProfileDTO:
    return await AuthService(db).get_my_profile(current_user)


@router.patch("/me", response_model=UserProfileDTO)
async def update_my_profile(payload: ProfileUpdateRequest, db: DBDep, current_user: CurrentUserDep) -> UserProfileDTO:
    return await AuthService(db).update_my_profile(payload=payload, current_user=current_user)


@router.post("/me/avatar", response_model=UserProfileDTO)
async def upload_my_avatar(
    db: DBDep,
    current_user: CurrentUserDep,
    avatar: UploadFile = File(...),
) -> UserProfileDTO:
    return await AuthService(db).upload_my_avatar(current_user=current_user, avatar=avatar)


@router.delete("/me/avatar", response_model=UserProfileDTO)
async def delete_my_avatar(db: DBDep, current_user: CurrentUserDep) -> UserProfileDTO:
    return await AuthService(db).delete_my_avatar(current_user=current_user)


@router.get("/avatar/{file_name}", response_class=FileResponse)
async def get_avatar(file_name: str) -> FileResponse:
    return FileResponse(resolve_avatar_path(file_name))


@router.post("/change-password", response_model=MessageResponseDTO)
async def change_password(
    payload: PasswordChangeRequest, db: DBDep, current_user: CurrentUserDep
) -> MessageResponseDTO:
    return await AuthService(db).change_password(payload=payload, current_user=current_user)


@router.get("/me/documents", response_model=list[DoctorQualificationDocumentDTO])
async def get_my_documents(db: DBDep, current_user: CurrentUserDep) -> list[DoctorQualificationDocumentDTO]:
    return await AuthService(db).get_my_documents(current_user)
