from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from src.api.v1.dependencies.auth import CurrentUserDep, require_verified_doctor
from src.api.v1.dependencies.db import DBDep
from src.models.auth import User
from src.schemas.qa import FreeQueueStatusDTO, QuestionCommentCreateDTO, QuestionCreateDTO, QuestionDTO
from src.services.qa import QuestionService

router = APIRouter(prefix="/questions", tags=["Q&A"])

VerifiedDoctorDep = Annotated[User, Depends(require_verified_doctor)]


@router.get("/", response_model=list[QuestionDTO])
async def list_questions(
    db: DBDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[QuestionDTO]:
    return await QuestionService(db).list_questions(offset=offset, limit=limit)


@router.get("/free-queue", response_model=FreeQueueStatusDTO)
async def get_free_queue_status(db: DBDep) -> FreeQueueStatusDTO:
    return await QuestionService(db).get_free_queue_status()


@router.get("/{question_id}", response_model=QuestionDTO)
async def get_question(question_id: int, db: DBDep) -> QuestionDTO:
    return await QuestionService(db).get_question(question_id)


@router.post("/", response_model=QuestionDTO, status_code=status.HTTP_201_CREATED)
async def create_question(payload: QuestionCreateDTO, db: DBDep, current_user: CurrentUserDep) -> QuestionDTO:
    return await QuestionService(db).create_question(payload, current_user)


@router.post("/{question_id}/comments", response_model=QuestionDTO, status_code=status.HTTP_201_CREATED)
async def create_comment(
    question_id: int,
    payload: QuestionCommentCreateDTO,
    db: DBDep,
    doctor: VerifiedDoctorDep,
) -> QuestionDTO:
    return await QuestionService(db).create_comment(question_id, payload, doctor)
