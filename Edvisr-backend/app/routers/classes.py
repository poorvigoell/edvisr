from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_teacher
from app.models import Assignment, Classroom, Student, Submission, Teacher
from app.schemas import (
    AssignmentCreate, AssignmentRead,
    ClassroomCreate, ClassroomRead,
    StudentCreate, StudentRead,
    SubmissionCreate, SubmissionRead,
)

router = APIRouter(dependencies=[Depends(get_current_teacher)], tags=["classes"])

def _ensure_exists(value: object | None, message: str) -> object:
    if value is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return value

@router.post("/classes", response_model=ClassroomRead, status_code=status.HTTP_201_CREATED)
def create_classroom(payload: ClassroomCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Classroom:
    classroom = Classroom(**payload.model_dump())
    # Ensure it's for the current teacher
    classroom.teacher_id = teacher.id
    db.add(classroom)
    db.commit()
    db.refresh(classroom)
    return classroom

@router.get("/classes", response_model=list[ClassroomRead])
def list_classes(teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[Classroom]:
    query = select(Classroom).where(Classroom.teacher_id == teacher.id).order_by(Classroom.created_at.desc())
    return db.scalars(query).all()

@router.get("/classes/{class_id}", response_model=ClassroomRead)
def get_classroom(class_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Classroom:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher.id))
    return _ensure_exists(classroom, "Class not found.")

@router.post("/students", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def create_student(payload: StudentCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Student:
    classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id, Classroom.teacher_id == teacher.id))
    _ensure_exists(classroom, "Class not found.")

    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student

@router.get("/students", response_model=list[StudentRead])
def list_students(class_id: int = Query(...), teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[Student]:
    # Ensure the class belongs to the teacher
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher.id))
    _ensure_exists(classroom, "Class not found.")
    
    return db.scalars(select(Student).where(Student.class_id == class_id).order_by(Student.full_name)).all()

@router.get("/students/{student_id}", response_model=StudentRead)
def get_student(student_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Student:
    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == student_id, Classroom.teacher_id == teacher.id)
    )
    return _ensure_exists(student, "Student not found.")

@router.post("/assignments", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def create_assignment(payload: AssignmentCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Assignment:
    classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id, Classroom.teacher_id == teacher.id))
    _ensure_exists(classroom, "Class not found.")

    assignment = Assignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment

@router.get("/assignments", response_model=list[AssignmentRead])
def list_assignments(class_id: int = Query(...), teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[Assignment]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher.id))
    _ensure_exists(classroom, "Class not found.")

    return db.scalars(select(Assignment).where(Assignment.class_id == class_id).order_by(Assignment.due_at, Assignment.id)).all()

@router.post("/submissions", response_model=SubmissionRead, status_code=status.HTTP_201_CREATED)
def upsert_submission(payload: SubmissionCreate, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> Submission:
    assignment = db.scalar(
        select(Assignment)
        .join(Classroom, Assignment.class_id == Classroom.id)
        .where(Assignment.id == payload.assignment_id, Classroom.teacher_id == teacher.id)
    )
    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == payload.student_id, Classroom.teacher_id == teacher.id)
    )
    _ensure_exists(assignment, "Assignment not found.")
    _ensure_exists(student, "Student not found.")

    if assignment.class_id != student.class_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student and assignment are from different classes.")

    submission = db.scalar(
        select(Submission).where(
            Submission.assignment_id == payload.assignment_id,
            Submission.student_id == payload.student_id,
        )
    )

    payload_dict = payload.model_dump()
    if payload.question_responses_json is not None:
        payload_dict["question_responses_json"] = [item.model_dump(exclude_none=True) for item in payload.question_responses_json]

    if submission is None:
        submission = Submission(**payload_dict)
        db.add(submission)
    else:
        for key, value in payload_dict.items():
            setattr(submission, key, value)

    db.commit()
    db.refresh(submission)
    return submission

@router.get("/submissions", response_model=list[SubmissionRead])
def list_submissions(
    class_id: int | None = Query(default=None),
    assignment_id: int | None = Query(default=None),
    student_id: int | None = Query(default=None),
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> list[Submission]:
    query = select(Submission).join(Assignment, Submission.assignment_id == Assignment.id).join(Classroom, Assignment.class_id == Classroom.id)
    query = query.where(Classroom.teacher_id == teacher.id)
    
    if class_id is not None:
        query = query.where(Assignment.class_id == class_id)
    if assignment_id is not None:
        query = query.where(Submission.assignment_id == assignment_id)
    if student_id is not None:
        query = query.where(Submission.student_id == student_id)
        
    return db.scalars(query.order_by(Submission.created_at.desc())).all()

@router.get("/classes/{class_id}/summary")
def class_summary(class_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict[str, int]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher.id))
    _ensure_exists(classroom, "Class not found.")

    student_count = db.scalar(select(func.count(Student.id)).where(Student.class_id == class_id)) or 0
    assignment_count = db.scalar(select(func.count(Assignment.id)).where(Assignment.class_id == class_id)) or 0
    submission_count = (
        db.scalar(
            select(func.count(Submission.id))
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .where(Assignment.class_id == class_id)
        )
        or 0
    )
    return {
        "students": int(student_count),
        "assignments": int(assignment_count),
        "submissions": int(submission_count),
    }
