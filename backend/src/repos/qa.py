from sqlalchemy import func, select

from src.models.qa import Question, QuestionComment
from src.repos.base import BaseRepo


class QuestionRepo(BaseRepo):
    def add(self, question: Question) -> None:
        self.session.add(question)

    async def get_by_id(self, question_id: int, *options) -> Question | None:
        statement = select(Question).where(Question.id == question_id)
        if options:
            statement = statement.options(*options)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_recent(self, limit: int, *options) -> list[Question]:
        statement = select(Question).order_by(Question.created_at.desc()).limit(limit)
        if options:
            statement = statement.options(*options)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_public(self, offset: int, limit: int, *options) -> list[Question]:
        statement = select(Question).order_by(Question.created_at.desc()).offset(offset).limit(limit)
        if options:
            statement = statement.options(*options)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_filtered(
        self, offset: int, limit: int, search: str | None, answered: bool | None, *options
    ) -> list[Question]:
        statement = select(Question)

        if search:
            statement = statement.where(Question.text.ilike(f"%{search.strip()}%"))
        if answered is True:
            statement = statement.where(Question.comments.any())
        elif answered is False:
            statement = statement.where(~Question.comments.any())

        statement = statement.order_by(Question.created_at.desc()).offset(offset).limit(limit)
        if options:
            statement = statement.options(*options)

        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_filtered(self, search: str | None, answered: bool | None) -> int:
        statement = select(func.count(Question.id))

        if search:
            statement = statement.where(Question.text.ilike(f"%{search.strip()}%"))
        if answered is True:
            statement = statement.where(Question.comments.any())
        elif answered is False:
            statement = statement.where(~Question.comments.any())

        return int(await self.session.scalar(statement) or 0)

    async def count_all(self) -> int:
        return int(await self.session.scalar(select(func.count(Question.id))) or 0)

    async def count_unanswered_free_questions(self) -> int:
        statement = select(func.count(Question.id)).where(
            Question.question_format == "free",
            ~Question.comments.any(),
        )
        return int(await self.session.scalar(statement) or 0)


class QuestionCommentRepo(BaseRepo):
    def add(self, comment: QuestionComment) -> None:
        self.session.add(comment)

    async def get_by_id(self, answer_id: int) -> QuestionComment | None:
        statement = select(QuestionComment).where(QuestionComment.id == answer_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_recent(self, limit: int, *options) -> list[QuestionComment]:
        statement = select(QuestionComment).order_by(QuestionComment.created_at.desc()).limit(limit)
        if options:
            statement = statement.options(*options)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_filtered(
        self,
        offset: int,
        limit: int,
        search: str | None,
        question_id: int | None,
        *options,
    ) -> list[QuestionComment]:
        statement = select(QuestionComment)

        if search:
            statement = statement.where(QuestionComment.text.ilike(f"%{search.strip()}%"))
        if question_id is not None:
            statement = statement.where(QuestionComment.question_id == question_id)

        statement = statement.order_by(QuestionComment.created_at.desc()).offset(offset).limit(limit)
        if options:
            statement = statement.options(*options)

        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_filtered(self, search: str | None, question_id: int | None) -> int:
        statement = select(func.count(QuestionComment.id))

        if search:
            statement = statement.where(QuestionComment.text.ilike(f"%{search.strip()}%"))
        if question_id is not None:
            statement = statement.where(QuestionComment.question_id == question_id)

        return int(await self.session.scalar(statement) or 0)

    async def count_all(self) -> int:
        return int(await self.session.scalar(select(func.count(QuestionComment.id))) or 0)
