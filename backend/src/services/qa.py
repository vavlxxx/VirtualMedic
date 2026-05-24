from fastapi import HTTPException, status

from src.api.v1.serializers import to_question
from src.models.enums import QuestionFormat
from src.models.auth import User
from src.models.qa import Question, QuestionComment
from src.repos.loaders import QUESTION_OPTIONS
from src.schemas.qa import FreeQueueStatusDTO, QuestionCommentCreateDTO, QuestionCreateDTO, QuestionDTO
from src.services.base import BaseService


class QuestionService(BaseService):
    async def list_questions(self, offset: int, limit: int) -> list[QuestionDTO]:
        questions = await self.db.questions.list_public(offset, limit, *QUESTION_OPTIONS)
        return [to_question(item) for item in questions]

    async def get_question(self, question_id: int) -> QuestionDTO:
        question = await self.db.questions.get_by_id(question_id, *QUESTION_OPTIONS)
        if question is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        return to_question(question)

    async def get_free_queue_status(self) -> FreeQueueStatusDTO:
        pending_count = await self.db.questions.count_unanswered_free_questions()
        return FreeQueueStatusDTO(pending_count=pending_count)

    async def create_question(self, payload: QuestionCreateDTO, patient: User) -> QuestionDTO:
        specialization_id = payload.specialization_id
        if specialization_id is not None:
            specialization = await self.db.specializations.get_by_id(specialization_id)
            if specialization is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specialization not found")

        text = payload.text or payload.details or payload.short_problem
        if text is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Question text is required")

        question_format = payload.question_format.value if payload.question_format else None
        if question_format == QuestionFormat.PAID.value:
            queue_position_at_submit = None
        elif question_format == QuestionFormat.FREE.value:
            queue_position_at_submit = payload.queue_position_at_submit
        else:
            queue_position_at_submit = None

        question = Question(
            text=text,
            author_id=patient.id,
            specialization_id=specialization_id,
            short_problem=payload.short_problem,
            details=payload.details,
            question_format=question_format,
            price_rub=payload.price_rub,
            is_paid_mock=payload.is_paid_mock,
            queue_position_at_submit=queue_position_at_submit,
            promo_code=payload.promo_code,
            patient_name=payload.patient_name,
            patient_age=payload.patient_age,
            chronic_conditions=payload.chronic_conditions,
            contact_email=str(payload.contact_email) if payload.contact_email else None,
            consent_terms=payload.consent_terms,
            consent_marketing=payload.consent_marketing,
            source=payload.source,
        )
        self.db.questions.add(question)
        await self.db.commit()

        created_question = await self.db.questions.get_by_id(question.id, *QUESTION_OPTIONS)
        if created_question is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        return to_question(created_question)

    async def create_comment(self, question_id: int, payload: QuestionCommentCreateDTO, doctor: User) -> QuestionDTO:
        question = await self.db.questions.get_by_id(question_id)
        if question is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        self.db.question_comments.add(
            QuestionComment(
                text=payload.text.strip(),
                question_id=question_id,
                author_id=doctor.id,
            )
        )
        await self.db.commit()

        updated_question = await self.db.questions.get_by_id(question_id, *QUESTION_OPTIONS)
        if updated_question is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        return to_question(updated_question)
