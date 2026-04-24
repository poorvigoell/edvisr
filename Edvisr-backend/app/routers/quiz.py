from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_teacher
from app.models import Classroom, QuizDocument, Teacher
from app.limiter import limiter
from app.schemas import (
    QuizDocumentCreate,
    QuizDocumentRead,
    QuizGenerationRequest,
    QuizGenerationResponse,
    WhatIfQuestionRequest,
    WhatIfQuestionResponse,
)
from quiz import generate_questions
from whatif import generate_what_if_question

router = APIRouter(tags=["quiz"], dependencies=[Depends(get_current_teacher)])

@router.post("/quiz/generate", response_model=QuizGenerationResponse)
@limiter.limit("10/minute")
def generate_quiz(request: Request, payload: QuizGenerationRequest) -> dict[str, str]:
    try:
        content = generate_questions(
            grade=payload.grade,
            topic=payload.topic,
            difficulty=payload.difficulty,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Quiz generation failed: {exc}") from exc

    return {"content": content.strip()}


@router.post("/what-if/generate", response_model=WhatIfQuestionResponse)
@limiter.limit("10/minute")
def generate_what_if(request: Request, payload: WhatIfQuestionRequest) -> dict[str, str]:
    try:
        question = generate_what_if_question(payload.topic)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"What-if generation failed: {exc}") from exc

    return {"question": question.strip()}


@router.post("/quiz/docs", response_model=QuizDocumentRead, status_code=status.HTTP_201_CREATED)
def create_quiz_doc(payload: QuizDocumentCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> QuizDocument:
    if payload.class_id is not None:
        classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id, Classroom.teacher_id == teacher.id))
        if classroom is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found.")

    document = QuizDocument(**payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("/quiz/docs", response_model=list[QuizDocumentRead])
def list_quiz_docs(
    class_id: int | None = Query(default=None),
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> list[QuizDocument]:
    query = select(QuizDocument).outerjoin(Classroom, QuizDocument.class_id == Classroom.id)
    # Only return docs for the teacher's classes, or docs with no class (assuming global or self-owned)
    # Since QuizDocument currently doesn't have teacher_id, we just filter by class_id that belongs to teacher.
    # To be perfectly secure, docs without a class_id might be visible to anyone, but let's restrict to ones that belong to the teacher's classes.
    query = query.where(
        (QuizDocument.class_id == None) | (Classroom.teacher_id == teacher.id)
    )
    if class_id is not None:
        query = query.where(QuizDocument.class_id == class_id)
        
    return db.scalars(query.order_by(QuizDocument.created_at.desc())).all()


@router.get("/quiz/docs/{doc_id}", response_model=QuizDocumentRead)
def get_quiz_doc(doc_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> QuizDocument:
    document = db.scalar(
        select(QuizDocument)
        .outerjoin(Classroom, QuizDocument.class_id == Classroom.id)
        .where(QuizDocument.id == doc_id, (QuizDocument.class_id == None) | (Classroom.teacher_id == teacher.id))
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz document not found.")
    return document


@router.delete("/quiz/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz_doc(doc_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> None:
    document = db.scalar(
        select(QuizDocument)
        .outerjoin(Classroom, QuizDocument.class_id == Classroom.id)
        .where(QuizDocument.id == doc_id, (QuizDocument.class_id == None) | (Classroom.teacher_id == teacher.id))
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz document not found.")
    db.delete(document)
    db.commit()
