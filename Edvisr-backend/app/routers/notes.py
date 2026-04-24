from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_teacher
from app.models import Classroom, Student, Teacher, TeacherNote
from app.schemas import TeacherNoteCreate, TeacherNoteRead

router = APIRouter(tags=["notes"], dependencies=[Depends(get_current_teacher)])

@router.post("/notes", response_model=TeacherNoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: TeacherNoteCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> TeacherNote:
    if payload.teacher_id != teacher.id:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create notes for another teacher.")

    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == payload.student_id, Classroom.teacher_id == teacher.id)
    )
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    note = TeacherNote(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/students/{student_id}/notes", response_model=list[TeacherNoteRead])
def list_student_notes(student_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[TeacherNote]:
    # Validate student belongs to teacher
    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == student_id, Classroom.teacher_id == teacher.id)
    )
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return db.scalars(
        select(TeacherNote).where(TeacherNote.student_id == student_id).order_by(TeacherNote.created_at.desc())
    ).all()
