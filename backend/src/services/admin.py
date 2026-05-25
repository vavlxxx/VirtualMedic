from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Response, status

from src.api.v1.serializers import to_admin_answer_item, to_admin_question_item, to_admin_user_item, to_doctor_detail
from src.models.auth import User
from src.models.enums import UserRole
from src.repos.loaders import ADMIN_USER_OPTIONS, ANSWER_OPTIONS, DOCTOR_DETAIL_OPTIONS, QUESTION_OPTIONS
from src.schemas.admin import (
    AdminAnswersResponseDTO,
    AdminDashboardResponseDTO,
    AdminOverviewStatsDTO,
    AdminQuestionsResponseDTO,
    AdminUserListItemDTO,
    AdminUsersResponseDTO,
    PendingDoctorsResponseDTO,
    UpdateUserStatusRequestDTO,
    AdminUpdateUserRequestDTO,
    VerifyDoctorRequestDTO,
)
from src.schemas.doctor import DoctorDetailDTO
from src.services.base import BaseService
from src.utils.files import resolve_document_path


@dataclass
class DocumentDownload:
    path: Path
    media_type: str
    filename: str


class AdminService(BaseService):
    async def get_dashboard(
        self,
        users_limit: int,
        questions_limit: int,
        answers_limit: int,
        pending_limit: int,
    ) -> AdminDashboardResponseDTO:
        users = await self.db.users.list_recent(users_limit, *ADMIN_USER_OPTIONS)
        questions = await self.db.questions.list_recent(questions_limit, *QUESTION_OPTIONS)
        answers = await self.db.question_comments.list_recent(answers_limit, *ANSWER_OPTIONS)
        pending_doctors = await self.db.users.list_pending(0, pending_limit, None, *DOCTOR_DETAIL_OPTIONS)

        return AdminDashboardResponseDTO(
            stats=AdminOverviewStatsDTO(
                total_users=await self.db.users.count_all(),
                total_inactive_users=await self.db.users.count_inactive(),
                total_patients=await self.db.users.count_by_role(UserRole.PATIENT),
                total_doctors=await self.db.users.count_by_role(UserRole.DOCTOR),
                total_verified_doctors=await self.db.users.count_verified_doctors(),
                total_pending_doctors=await self.db.users.count_pending_doctors(),
                total_questions=await self.db.questions.count_all(),
                total_answers=await self.db.question_comments.count_all(),
            ),
            users=[to_admin_user_item(user) for user in users],
            questions=[to_admin_question_item(question) for question in questions],
            recent_answers=[to_admin_answer_item(answer) for answer in answers],
            pending_doctors=[to_doctor_detail(item) for item in pending_doctors],
        )

    async def list_users(
        self,
        offset: int,
        limit: int,
        search: str | None,
        role: UserRole | None,
        is_active: bool | None,
        is_verified_doctor: bool | None,
    ) -> AdminUsersResponseDTO:
        users = await self.db.users.list_filtered(
            offset,
            limit,
            search,
            role,
            is_active,
            is_verified_doctor,
            *ADMIN_USER_OPTIONS,
        )
        total = await self.db.users.count_filtered(
            search=search,
            role=role,
            is_active=is_active,
            is_verified_doctor=is_verified_doctor,
        )
        return AdminUsersResponseDTO(items=[to_admin_user_item(user) for user in users], total=total)

    async def update_user_status(
        self,
        user_id: int,
        payload: UpdateUserStatusRequestDTO,
        admin: User,
    ) -> AdminUserListItemDTO:
        if user_id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own activity status"
            )

        user = await self.db.users.get_by_id(user_id, *ADMIN_USER_OPTIONS)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        user.is_active = payload.is_active
        await self.db.commit()
        return to_admin_user_item(user)

    async def update_user(
        self,
        user_id: int,
        payload: AdminUpdateUserRequestDTO,
        admin: User,
    ) -> AdminUserListItemDTO:
        user = await self.db.users.get_by_id(user_id, *ADMIN_USER_OPTIONS)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if payload.first_name is not None:
            user.first_name = payload.first_name
        if payload.last_name is not None:
            user.last_name = payload.last_name
        if payload.role is not None:
            if user_id == admin.id and payload.role != admin.role:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role")
            user.role = payload.role

        await self.db.commit()
        return to_admin_user_item(user)

    async def delete_user(self, user_id: int, admin: User) -> Response:
        if user_id == admin.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

        user = await self.db.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        await self.db.delete(user)
        await self.db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    async def list_questions(
        self,
        offset: int,
        limit: int,
        search: str | None,
        answered: bool | None,
    ) -> AdminQuestionsResponseDTO:
        questions = await self.db.questions.list_filtered(
            offset,
            limit,
            search,
            answered,
            *QUESTION_OPTIONS,
        )
        total = await self.db.questions.count_filtered(search=search, answered=answered)
        return AdminQuestionsResponseDTO(
            items=[to_admin_question_item(question) for question in questions], total=total
        )

    async def delete_question(self, question_id: int) -> Response:
        question = await self.db.questions.get_by_id(question_id)
        if question is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        await self.db.delete(question)
        await self.db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    async def list_answers(
        self,
        offset: int,
        limit: int,
        search: str | None,
        question_id: int | None,
    ) -> AdminAnswersResponseDTO:
        answers = await self.db.question_comments.list_filtered(
            offset,
            limit,
            search,
            question_id,
            *ANSWER_OPTIONS,
        )
        total = await self.db.question_comments.count_filtered(search=search, question_id=question_id)
        return AdminAnswersResponseDTO(items=[to_admin_answer_item(answer) for answer in answers], total=total)

    async def delete_answer(self, answer_id: int) -> Response:
        answer = await self.db.question_comments.get_by_id(answer_id)
        if answer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found")

        await self.db.delete(answer)
        await self.db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    async def get_pending_doctors(self, offset: int, limit: int, search: str | None) -> PendingDoctorsResponseDTO:
        doctors = await self.db.users.list_pending(offset, limit, search, *DOCTOR_DETAIL_OPTIONS)
        total = await self.db.users.count_pending(search=search)
        return PendingDoctorsResponseDTO(items=[to_doctor_detail(item) for item in doctors], total=total)

    async def get_doctor_for_moderation(self, doctor_id: int) -> DoctorDetailDTO:
        doctor = await self.db.users.get_doctor_by_id(doctor_id, *DOCTOR_DETAIL_OPTIONS)
        if doctor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
        return to_doctor_detail(doctor)

    async def verify_doctor(self, doctor_id: int, payload: VerifyDoctorRequestDTO) -> DoctorDetailDTO:
        doctor = await self.db.users.get_doctor_by_id(doctor_id, *DOCTOR_DETAIL_OPTIONS)
        if doctor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

        if payload.is_verified and not doctor.qualification_documents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor must have at least one uploaded qualification document",
            )

        doctor.is_verified_doctor = payload.is_verified
        await self.db.commit()
        return to_doctor_detail(doctor)

    async def get_document_download(self, document_id: int) -> DocumentDownload:
        document = await self.db.documents.get_by_id(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        return DocumentDownload(
            path=resolve_document_path(document.stored_file_name),
            media_type=document.content_type,
            filename=document.original_file_name,
        )
