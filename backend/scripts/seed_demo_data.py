from __future__ import annotations

# ruff: noqa: E501

import asyncio
import hashlib
import sys
from base64 import b64encode
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import selectinload

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from src.config import settings  # noqa: E402
from src.db import sessionmaker  # noqa: E402
from src.models.auth import RefreshSession, User  # noqa: E402
from src.models.doctor import DoctorQualificationDocument, Specialization, doctor_specializations  # noqa: E402
from src.models.enums import UserRole  # noqa: E402
from src.models.qa import Question, QuestionComment  # noqa: E402
from src.utils.security import generate_jti, hash_password, hash_token, utc_now  # noqa: E402

DEMO_PASSWORD = "DemoPass!2026"
LOCAL_UPLOAD_DIR = ROOT_DIR / "uploads" / "doctor_documents"

DEMO_AVATAR_URLS = {
    "doctor.kuznetsova": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=640&q=80",
    "doctor.orlov": "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=640&q=80",
    "doctor.morozova": "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=640&q=80",
    "doctor.sokolov": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=640&q=80",
    "doctor.volkova": "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=640&q=80",
    "doctor.lebedev": "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=640&q=80",
    "doctor.fedorova": "https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=640&q=80",
    "doctor.nikitin": "https://images.unsplash.com/photo-1605684954998-685c79d6a018?auto=format&fit=crop&w=640&q=80",
}


SPECIALIZATIONS = [
    "Терапия",
    "Педиатрия",
    "Кардиология",
    "Неврология",
    "Дерматология",
    "Гастроэнтерология",
    "Эндокринология",
    "Пульмонология",
]

DOCTORS = [
    ("doctor.kuznetsova", "Анна", "Кузнецова", ["Терапия", "Гастроэнтерология"], True),
    ("doctor.orlov", "Игорь", "Орлов", ["Кардиология", "Терапия"], True),
    ("doctor.morozova", "Елена", "Морозова", ["Педиатрия"], True),
    ("doctor.sokolov", "Дмитрий", "Соколов", ["Неврология"], True),
    ("doctor.volkova", "Мария", "Волкова", ["Дерматология"], True),
    ("doctor.lebedev", "Павел", "Лебедев", ["Эндокринология"], True),
    ("doctor.fedorova", "Ольга", "Федорова", ["Пульмонология"], False),
    ("doctor.nikitin", "Алексей", "Никитин", ["Гастроэнтерология"], False),
]

PATIENTS = [
    ("patient.smirnova", "Ирина", "Смирнова"),
    ("patient.egorov", "Максим", "Егоров"),
    ("patient.romanova", "Наталья", "Романова"),
    ("patient.belov", "Артем", "Белов"),
    ("patient.karpova", "Светлана", "Карпова"),
    ("patient.antonov", "Сергей", "Антонов"),
]

QUESTIONS = [
    (
        "patient.smirnova",
        "Третий день держится температура 37.5, ломота и сухой кашель. Сатурация 97, одышки нет. Что делать дома и когда обращаться очно?",
        [("doctor.kuznetsova", "Пейте больше жидкости, контролируйте температуру и сатурацию. Если появится одышка, боль в груди или температура выше 38.5 дольше трех дней, нужен очный осмотр.")],
    ),
    (
        "patient.egorov",
        "После тренировки появилась давящая боль в груди слева, проходит в покое за 10 минут. Давление 145/90. Это может быть сердце?",
        [("doctor.orlov", "Такая боль требует очной оценки. Рекомендую ЭКГ и консультацию кардиолога в ближайшее время, а при повторе боли в покое вызвать скорую помощь.")],
    ),
    (
        "patient.romanova",
        "Ребенку 6 лет, насморк и кашель неделю, сегодня заболело ухо. Температура 37.8. Можно ли ждать до утра?",
        [("doctor.morozova", "Боль в ухе после ОРВИ часто бывает при отите. Дайте жаропонижающее по весу при боли или температуре и покажите ребенка ЛОР-врачу или педиатру в ближайшие сутки.")],
    ),
    (
        "patient.belov",
        "Месяц беспокоят головные боли после работы за компьютером, иногда немеет правая кисть. Давление нормальное.",
        [("doctor.sokolov", "Похоже на сочетание мышечного напряжения и возможной компрессии нерва. Нужен неврологический осмотр, оценка шейного отдела и режима рабочего места.")],
    ),
    (
        "patient.karpova",
        "На коже рук появились сухие красные пятна, сильно зудят после бытовой химии. Кремы помогают ненадолго.",
        [("doctor.volkova", "Вероятен контактный дерматит. Используйте перчатки, мягкие очищающие средства и эмоленты. Если зуд выраженный, лучше очно подобрать противовоспалительное лечение.")],
    ),
    (
        "patient.antonov",
        "Частая изжога после ужина и кислый привкус по утрам. Боли сильной нет, но симптомы почти каждый день.",
        [("doctor.kuznetsova", "Симптомы похожи на рефлюкс. Попробуйте не есть за 3 часа до сна, уменьшить кофе и жирную пищу. При ежедневных симптомах нужна консультация гастроэнтеролога.")],
    ),
    (
        "patient.smirnova",
        "ТТГ 6.2, слабость и сонливость, вес немного растет. Нужно ли сразу начинать гормоны?",
        [("doctor.lebedev", "Решение зависит от свободного Т4, антител, возраста, беременности и симптомов. Стоит повторить анализы и обсудить результат с эндокринологом.")],
    ),
    (
        "patient.egorov",
        "После антибиотиков вздутие и неустойчивый стул уже две недели. Какие анализы стоит сдать?",
        [],
    ),
    (
        "patient.romanova",
        "У ребенка периодически свистящее дыхание после простуды, особенно ночью. Между эпизодами чувствует себя нормально.",
        [("doctor.fedorova", "Нужна очная оценка педиатра или пульмонолога. Важно исключить бронхообструкцию и аллергию, особенно если эпизоды повторяются после инфекций.")],
    ),
    (
        "patient.belov",
        "Появилась боль в желудке натощак, после еды становится легче. НПВС не принимаю.",
        [],
    ),
]


def avatar_data_url(first_name: str, last_name: str, color: str) -> str:
    initials = f"{first_name[:1]}{last_name[:1]}".upper()
    svg = f"""
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="{color}"/>
  <circle cx="160" cy="128" r="58" fill="#ffffff" opacity="0.9"/>
  <rect x="72" y="206" width="176" height="84" rx="42" fill="#ffffff" opacity="0.9"/>
  <text x="160" y="178" text-anchor="middle" font-family="Arial" font-size="64" font-weight="700" fill="{color}">{initials}</text>
</svg>
""".strip()
    return f"data:image/svg+xml;base64,{b64encode(svg.encode('utf-8')).decode('ascii')}"


def get_seed_upload_directory() -> Path:
    upload_directory = settings.upload.directory
    if upload_directory.as_posix().startswith("/app/"):
        return LOCAL_UPLOAD_DIR
    return upload_directory


def get_demo_avatar_url(username: str, first_name: str, last_name: str) -> str:
    if username in DEMO_AVATAR_URLS:
        return DEMO_AVATAR_URLS[username]

    colors = ["#245ebd", "#16875f", "#8a4f16", "#6b5ca5", "#b42318", "#0f766e"]
    color = colors[abs(hash(username)) % len(colors)]
    return avatar_data_url(first_name, last_name, color)


async def get_or_create_specializations(session) -> dict[str, Specialization]:
    result = await session.execute(select(Specialization))
    existing = {item.name: item for item in result.scalars().all()}

    for name in SPECIALIZATIONS:
        if name not in existing:
            specialization = Specialization(name=name)
            session.add(specialization)
            existing[name] = specialization

    await session.flush()
    return existing


async def get_or_create_user(session, username: str, first_name: str, last_name: str, role: UserRole) -> User:
    user = await session.scalar(
        select(User)
        .where(User.username == username)
        .options(selectinload(User.specializations), selectinload(User.qualification_documents))
    )
    if user is not None:
        next_avatar_url = get_demo_avatar_url(username, first_name, last_name)
        if not user.avatar_url or user.avatar_url.startswith("data:image/svg+xml"):
            user.avatar_url = next_avatar_url
        return user

    user = User(
        username=username,
        password_hash=hash_password(DEMO_PASSWORD),
        first_name=first_name,
        last_name=last_name,
        avatar_url=get_demo_avatar_url(username, first_name, last_name),
        role=role,
        is_active=True,
        is_verified_doctor=False,
    )
    session.add(user)
    await session.flush()
    return user


async def ensure_doctor_document(session, doctor: User) -> None:
    existing = await session.scalar(
        select(DoctorQualificationDocument).where(DoctorQualificationDocument.doctor_id == doctor.id)
    )
    if existing is not None:
        return

    upload_directory = get_seed_upload_directory()
    upload_directory.mkdir(parents=True, exist_ok=True)
    content = (
        b"%PDF-1.4\n"
        + f"Demo qualification document for {doctor.first_name} {doctor.last_name}\n".encode("utf-8")
        + b"%%EOF\n"
    )
    sha256 = hashlib.sha256(content).hexdigest()
    stored_file_name = f"demo-{doctor.username.replace('.', '-')}.pdf"
    destination = upload_directory / stored_file_name
    destination.write_bytes(content)

    session.add(
        DoctorQualificationDocument(
            doctor_id=doctor.id,
            original_file_name=f"Сертификат {doctor.last_name}.pdf",
            stored_file_name=stored_file_name,
            content_type="application/pdf",
            size_bytes=len(content),
            sha256=sha256,
        )
    )


async def ensure_online_session(session, user: User) -> None:
    existing = await session.scalar(select(RefreshSession).where(RefreshSession.user_id == user.id))
    if existing is not None:
        existing.updated_at = utc_now()
        existing.expires_at = utc_now() + timedelta(days=7)
        return

    session.add(
        RefreshSession(
            jti=generate_jti(),
            user_id=user.id,
            token_hash=hash_token(f"demo-refresh-token-{user.username}"),
            user_agent="VirtualMedic demo seed",
            ip_address="127.0.0.1",
            expires_at=utc_now() + timedelta(days=7),
            updated_at=utc_now(),
        )
    )


async def replace_doctor_specializations(
    session,
    doctor: User,
    specialization_names: list[str],
    specializations: dict[str, Specialization],
) -> None:
    await session.execute(delete(doctor_specializations).where(doctor_specializations.c.doctor_id == doctor.id))
    await session.execute(
        insert(doctor_specializations),
        [
            {
                "doctor_id": doctor.id,
                "specialization_id": specializations[name].id,
            }
            for name in specialization_names
        ],
    )


async def seed() -> None:
    async with sessionmaker() as session:
        specializations = await get_or_create_specializations(session)

        doctors: dict[str, User] = {}
        for username, first_name, last_name, names, is_online in DOCTORS:
            doctor = await get_or_create_user(session, username, first_name, last_name, UserRole.DOCTOR)
            doctor.is_verified_doctor = True
            await replace_doctor_specializations(session, doctor, names, specializations)
            await ensure_doctor_document(session, doctor)
            if is_online:
                await ensure_online_session(session, doctor)
            doctors[username] = doctor

        patients: dict[str, User] = {}
        for username, first_name, last_name in PATIENTS:
            patients[username] = await get_or_create_user(session, username, first_name, last_name, UserRole.PATIENT)

        await session.flush()

        for patient_username, text, answers in QUESTIONS:
            question = await session.scalar(select(Question).where(Question.text == text))
            if question is None:
                question = Question(text=text, author_id=patients[patient_username].id)
                session.add(question)
                await session.flush()

            existing_answer_authors = set(
                (
                    await session.execute(
                        select(QuestionComment.author_id).where(QuestionComment.question_id == question.id)
                    )
                ).scalars()
            )
            for doctor_username, answer_text in answers:
                doctor = doctors[doctor_username]
                if doctor.id not in existing_answer_authors:
                    session.add(
                        QuestionComment(
                            text=answer_text,
                            question_id=question.id,
                            author_id=doctor.id,
                        )
                    )

        await session.commit()

    print("Demo data seeded.")
    print(f"Demo user password for seeded accounts: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
