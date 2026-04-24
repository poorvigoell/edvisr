from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    hash_password,
    verify_password,
    verify_sign_in_password,
)
from app.database import get_db
from app.deps import get_current_teacher
from app.models import Classroom, Teacher, TeacherCredential
from app.schemas import AuthTokenResponse, SignInRequest, SignUpRequest, TeacherRead

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/sign-in", response_model=AuthTokenResponse)
def sign_in(payload: SignInRequest, db: Session = Depends(get_db)) -> dict:
    teacher = db.scalar(select(Teacher).where(Teacher.email == payload.email))
    if teacher is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    credential = db.scalar(
        select(TeacherCredential).where(TeacherCredential.teacher_id == teacher.id)
    )
    password_valid = (
        verify_password(payload.password, credential.password_hash)
        if credential is not None
        else verify_sign_in_password(payload.password)
    )
    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token(teacher)
    return {
        "access_token": token,
        "token_type": "bearer",
        "teacher": teacher,
    }

@router.post(
    "/sign-up",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def sign_up(payload: SignUpRequest, db: Session = Depends(get_db)) -> dict:
    exists = db.scalar(select(Teacher).where(Teacher.email == payload.email))
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teacher with this email already exists.",
        )

    teacher = Teacher(email=payload.email, full_name=payload.full_name)
    db.add(teacher)
    db.flush()

    starter_classroom = Classroom(
        teacher_id=teacher.id,
        name="My Class",
        subject="General",
        term="Current Term",
        platform_source="manual",
    )
    db.add(starter_classroom)

    credential = TeacherCredential(
        teacher_id=teacher.id,
        password_hash=hash_password(payload.password),
    )
    db.add(credential)
    db.commit()
    db.refresh(teacher)

    token = create_access_token(teacher)
    return {
        "access_token": token,
        "token_type": "bearer",
        "teacher": teacher,
    }

@router.get("/me", response_model=TeacherRead)
def auth_me(teacher: Teacher = Depends(get_current_teacher)) -> Teacher:
    return teacher
