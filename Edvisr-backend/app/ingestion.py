from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Assignment, Classroom, Student, Submission, Teacher
from .schemas import (
    IngestionAssignment,
    IngestionStudent,
    SimpleScoresIngestionRequest,
    TestScoresInput,
    StructuredIngestionRequest,
)


def _find_or_create_teacher(db: Session, email: str, full_name: str) -> Teacher:
    teacher = db.scalar(select(Teacher).where(Teacher.email == email))
    if teacher:
        if teacher.full_name != full_name:
            teacher.full_name = full_name
        return teacher

    teacher = Teacher(email=email, full_name=full_name)
    db.add(teacher)
    db.flush()
    return teacher


def _create_classroom(db: Session, teacher_id: int, payload: StructuredIngestionRequest) -> Classroom:
    classroom = Classroom(
        teacher_id=teacher_id,
        name=payload.classroom.name,
        subject=payload.classroom.subject,
        term=payload.classroom.term,
        platform_source=payload.classroom.platform_source,
        external_id=payload.classroom.external_id,
    )
    db.add(classroom)
    db.flush()
    return classroom


def _create_students(db: Session, class_id: int, students: list[IngestionStudent]) -> tuple[list[Student], dict[str, Student]]:
    created_students: list[Student] = []
    lookup: dict[str, Student] = {}

    for item in students:
        student = Student(
            class_id=class_id,
            full_name=item.full_name,
            roll_number=item.roll_number,
            email=item.email,
            external_id=item.external_id,
        )
        db.add(student)
        db.flush()
        created_students.append(student)

        if item.external_id:
            lookup[f"external:{item.external_id}"] = student
        if item.roll_number:
            lookup[f"roll:{item.roll_number}"] = student
        if item.email:
            lookup[f"email:{item.email}"] = student

    return created_students, lookup


def _find_or_create_assignment(db: Session, class_id: int, payload: IngestionAssignment) -> tuple[Assignment, bool]:
    assignment = None
    if payload.external_id:
        assignment = db.scalar(
            select(Assignment).where(Assignment.class_id == class_id, Assignment.external_id == payload.external_id)
        )

    created = False
    if assignment is None:
        assignment = Assignment(
            class_id=class_id,
            title=payload.title,
            external_id=payload.external_id,
            max_score=payload.max_score,
            due_at=payload.due_at,
            published_at=payload.published_at,
        )
        db.add(assignment)
        db.flush()
        created = True
    else:
        assignment.title = payload.title
        assignment.max_score = payload.max_score
        assignment.due_at = payload.due_at
        assignment.published_at = payload.published_at

    return assignment, created


def ingest_structured_data(db: Session, payload: StructuredIngestionRequest) -> dict[str, int]:
    teacher = _find_or_create_teacher(
        db=db,
        email=payload.teacher.email,
        full_name=payload.teacher.full_name,
    )
    classroom = _create_classroom(db=db, teacher_id=teacher.id, payload=payload)
    students, student_lookup = _create_students(db=db, class_id=classroom.id, students=payload.students)

    assignments_created = 0
    submissions_created_or_updated = 0
    unresolved_submission_rows = 0

    for assignment_payload in payload.assignments:
        assignment, created = _find_or_create_assignment(db, classroom.id, assignment_payload)
        assignments_created += int(created)

        for submission_payload in assignment_payload.submissions:
            student = None
            if submission_payload.student_external_id:
                student = student_lookup.get(f"external:{submission_payload.student_external_id}")
            if student is None and submission_payload.student_roll_number:
                student = student_lookup.get(f"roll:{submission_payload.student_roll_number}")
            if student is None and submission_payload.student_email:
                student = student_lookup.get(f"email:{submission_payload.student_email}")

            if student is None:
                unresolved_submission_rows += 1
                continue

            submission = db.scalar(
                select(Submission).where(
                    Submission.assignment_id == assignment.id,
                    Submission.student_id == student.id,
                )
            )
            if submission is None:
                submission = Submission(assignment_id=assignment.id, student_id=student.id)
                db.add(submission)

            submission.status = submission_payload.status
            submission.submitted_at = submission_payload.submitted_at
            submission.raw_score = submission_payload.raw_score
            submission.max_score = submission_payload.max_score or assignment.max_score
            submission.rubric_json = submission_payload.rubric_json
            if submission_payload.question_responses_json is not None:
                submission.question_responses_json = [
                    question.model_dump(exclude_none=True) for question in submission_payload.question_responses_json
                ]
            submissions_created_or_updated += 1

    db.commit()

    return {
        "teacher_id": teacher.id,
        "class_id": classroom.id,
        "students_created": len(students),
        "assignments_created": assignments_created,
        "submissions_created_or_updated": submissions_created_or_updated,
        "unresolved_submission_rows": unresolved_submission_rows,
    }


def _find_student_for_row(db: Session, class_id: int, row) -> Student | None:
    if row.email:
        by_email = db.scalar(
            select(Student).where(Student.class_id == class_id, Student.email == row.email)
        )
        if by_email is not None:
            return by_email

    if row.roll_number:
        by_roll = db.scalar(
            select(Student).where(Student.class_id == class_id, Student.roll_number == row.roll_number)
        )
        if by_roll is not None:
            return by_roll

    return db.scalar(
        select(Student).where(Student.class_id == class_id, Student.full_name == row.student_name)
    )


def _find_or_create_test_assignment(db: Session, class_id: int, test: TestScoresInput) -> tuple[Assignment, bool]:
    assignment = db.scalar(
        select(Assignment).where(
            Assignment.class_id == class_id,
            Assignment.title == test.title,
            Assignment.due_at == test.due_at,
        )
    )

    created = False
    if assignment is None:
        assignment = Assignment(
            class_id=class_id,
            title=test.title,
            max_score=test.max_score,
            due_at=test.due_at,
            published_at=test.published_at,
        )
        db.add(assignment)
        db.flush()
        created = True
    else:
        assignment.max_score = test.max_score
        assignment.published_at = test.published_at

    return assignment, created


def ingest_simple_scores(
    db: Session,
    teacher: Teacher,
    payload: SimpleScoresIngestionRequest,
) -> dict[str, int]:
    if payload.class_id is not None:
        classroom = db.scalar(
            select(Classroom).where(
                Classroom.id == payload.class_id,
                Classroom.teacher_id == teacher.id,
            )
        )
        if classroom is None:
            raise ValueError("Class not found for this teacher.")
    else:
        classroom = db.scalar(
            select(Classroom).where(
                Classroom.teacher_id == teacher.id,
                Classroom.name == payload.class_name,
                Classroom.subject == payload.subject,
            )
        )
        if classroom is None:
            classroom = Classroom(
                teacher_id=teacher.id,
                name=payload.class_name or "My Class",
                subject=payload.subject or "General",
                term=payload.term,
                platform_source="manual",
            )
            db.add(classroom)
            db.flush()

    assignments_created = 0
    submissions_created_or_updated = 0
    missing_submissions_marked = 0
    students_created = 0

    for test in payload.tests:
        assignment, assignment_created = _find_or_create_test_assignment(
            db, classroom.id, test
        )
        assignments_created += int(assignment_created)

        seen_student_ids: set[int] = set()

        for row in test.scores:
            student = _find_student_for_row(db, classroom.id, row)
            if student is None:
                student = Student(
                    class_id=classroom.id,
                    full_name=row.student_name,
                    roll_number=row.roll_number,
                    email=row.email,
                )
                db.add(student)
                db.flush()
                students_created += 1

            seen_student_ids.add(student.id)
            submission = db.scalar(
                select(Submission).where(
                    Submission.assignment_id == assignment.id,
                    Submission.student_id == student.id,
                )
            )
            if submission is None:
                submission = Submission(
                    assignment_id=assignment.id,
                    student_id=student.id,
                )
                db.add(submission)

            is_missing = row.status == "missing" or row.score is None
            submission.status = "missing" if is_missing else row.status
            submission.raw_score = None if is_missing else row.score
            submission.max_score = row.max_score or assignment.max_score
            submission.submitted_at = None if is_missing else datetime.utcnow()
            submissions_created_or_updated += 1

        class_students = db.scalars(
            select(Student).where(Student.class_id == classroom.id)
        ).all()
        for student in class_students:
            if student.id in seen_student_ids:
                continue
            submission = db.scalar(
                select(Submission).where(
                    Submission.assignment_id == assignment.id,
                    Submission.student_id == student.id,
                )
            )
            if submission is None:
                submission = Submission(
                    assignment_id=assignment.id,
                    student_id=student.id,
                )
                db.add(submission)

            submission.status = "missing"
            submission.raw_score = None
            submission.max_score = assignment.max_score
            submission.submitted_at = None
            missing_submissions_marked += 1
            submissions_created_or_updated += 1

    db.commit()
    return {
        "class_id": classroom.id,
        "students_created": students_created,
        "assignments_created": assignments_created,
        "submissions_created_or_updated": submissions_created_or_updated,
        "missing_submissions_marked": missing_submissions_marked,
    }
