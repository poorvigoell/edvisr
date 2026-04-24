import csv
from datetime import datetime
from io import StringIO

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import class_dashboard, concept_insights, risk_signals, student_profile
from .auth import (
    create_access_token,
    extract_bearer_token,
    hash_password,
    verify_access_token,
    verify_password,
    verify_sign_in_password,
)
from .database import get_db
from .ingestion import ingest_simple_scores, ingest_structured_data
from .models import (
    Assignment,
    Classroom,
    Insight,
    QuizDocument,
    Student,
    Submission,
    Teacher,
    TeacherCredential,
    TeacherNote,
)
from .schemas import (
    AssignmentCreate,
    AssignmentRead,
    AuthTokenResponse,
    ClassDashboardResponse,
    ClassroomCreate,
    ClassroomRead,
    ConceptInsightsResponse,
    IngestionSummary,
    RiskSignalsResponse,
    StudentCreate,
    StudentProfileResponse,
    StudentRead,
    StructuredIngestionRequest,
    SubmissionCreate,
    SubmissionRead,
    SignInRequest,
    SignUpRequest,
    SimpleScoresIngestionRequest,
    SimpleScoresIngestionSummary,
    TeacherCreate,
    QuizDocumentCreate,
    QuizDocumentRead,
    TeacherNoteCreate,
    TeacherNoteRead,
    TeacherRead,
    QuizGenerationRequest,
    QuizGenerationResponse,
    WhatIfQuestionRequest,
    WhatIfQuestionResponse,
)
from quiz import generate_questions
from whatif import generate_what_if_question

router = APIRouter()


def _ensure_exists(value: object | None, message: str) -> object:
    if value is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return value


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


def _get_teacher_from_auth_header(authorization: str | None, db: Session) -> Teacher:
    token = extract_bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    try:
        payload = verify_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    raw_teacher_id = payload.get("sub")
    try:
        teacher_id = int(str(raw_teacher_id))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token payload.") from exc

    teacher = db.scalar(select(Teacher).where(Teacher.id == teacher_id))
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Teacher for token not found.")
    return teacher


def _csv_cell(row: dict[str, str | None], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _parse_optional_csv_float(raw_value: str, field_name: str, line_number: int) -> float | None:
    value = raw_value.strip()
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ValueError(f"Line {line_number}: invalid {field_name} value '{raw_value}'.") from exc
    if parsed < 0:
        raise ValueError(f"Line {line_number}: {field_name} must be non-negative.")
    return parsed


def _parse_required_csv_float(raw_value: str, field_name: str, line_number: int) -> float:
    parsed = _parse_optional_csv_float(raw_value, field_name, line_number)
    if parsed is None:
        raise ValueError(f"Line {line_number}: {field_name} is required.")
    return parsed


def _parse_optional_csv_datetime(raw_value: str, field_name: str, line_number: int) -> str | None:
    value = raw_value.strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError as exc:
        raise ValueError(
            f"Line {line_number}: invalid {field_name} value '{raw_value}'. Use ISO date or datetime."
        ) from exc


def _build_simple_scores_payload_from_csv(
    csv_text: str,
    class_name_override: str | None = None,
    subject_override: str | None = None,
    term_override: str | None = None,
) -> SimpleScoresIngestionRequest:
    class_name_override = class_name_override.strip() if class_name_override else None
    subject_override = subject_override.strip() if subject_override else None
    term_override = term_override.strip() if term_override else None

    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV must include a header row.")

    normalized_headers = {header.strip().lower() for header in reader.fieldnames if header is not None}
    required_headers = {"test_title", "student_name"}
    if class_name_override is None:
        required_headers.add("class_name")
    if subject_override is None:
        required_headers.add("subject")
    missing_headers = sorted(required_headers - normalized_headers)
    if missing_headers:
        raise ValueError(f"CSV missing required columns: {', '.join(missing_headers)}.")
    if "score" not in normalized_headers and "status" not in normalized_headers:
        raise ValueError("CSV must include at least one of: score, status.")

    class_name: str | None = None
    subject: str | None = None
    term: str | None = None
    tests: dict[tuple[str, float, str, str], dict] = {}
    data_rows = 0

    for line_number, raw_row in enumerate(reader, start=2):
        row = {str(key).strip().lower(): (value.strip() if value else "") for key, value in raw_row.items() if key}
        if not any(row.values()):
            continue

        data_rows += 1
        row_class_name = class_name_override or _csv_cell(row, "class_name")
        row_subject = subject_override or _csv_cell(row, "subject")
        row_term = term_override or _csv_cell(row, "term")
        test_title = _csv_cell(row, "test_title")
        student_name = _csv_cell(row, "student_name")

        if not row_class_name:
            raise ValueError(f"Line {line_number}: class_name is required.")
        if not row_subject:
            raise ValueError(f"Line {line_number}: subject is required.")
        if not test_title:
            raise ValueError(f"Line {line_number}: test_title is required.")
        if not student_name:
            raise ValueError(f"Line {line_number}: student_name is required.")

        if class_name is None:
            class_name = row_class_name
        elif class_name != row_class_name:
            raise ValueError(f"Line {line_number}: all rows must use the same class_name.")

        if subject is None:
            subject = row_subject
        elif subject != row_subject:
            raise ValueError(f"Line {line_number}: all rows must use the same subject.")

        if row_term:
            if term is None:
                term = row_term
            elif term != row_term:
                raise ValueError(f"Line {line_number}: all rows must use the same term.")

        test_max_score = _parse_optional_csv_float(
            _csv_cell(row, "max_score", "test_max_score"),
            "max_score",
            line_number,
        )
        due_at = _parse_optional_csv_datetime(
            _csv_cell(row, "due_at", "test_due_at"),
            "due_at",
            line_number,
        )
        published_at = _parse_optional_csv_datetime(
            _csv_cell(row, "published_at", "test_published_at"),
            "published_at",
            line_number,
        )
        test_key = (test_title, test_max_score or 100.0, due_at or "", published_at or "")
        if test_key not in tests:
            tests[test_key] = {
                "title": test_title,
                "max_score": test_max_score or 100.0,
                "scores": [],
            }
            if due_at:
                tests[test_key]["due_at"] = due_at
            if published_at:
                tests[test_key]["published_at"] = published_at

        score = _parse_optional_csv_float(_csv_cell(row, "score"), "score", line_number)
        status = _csv_cell(row, "status").lower()
        if status and status not in {"submitted", "late", "missing"}:
            raise ValueError(f"Line {line_number}: status must be submitted, late, or missing.")
        if not status:
            status = "missing" if score is None else "submitted"
        if score is None:
            status = "missing"

        score_row = {
            "student_name": student_name,
            "status": status,
        }
        roll_number = _csv_cell(row, "roll_number")
        email = _csv_cell(row, "email")
        if roll_number:
            score_row["roll_number"] = roll_number
        if email:
            score_row["email"] = email
        if score is not None:
            score_row["score"] = score

        row_max_score_raw = _csv_cell(row, "submission_max_score", "student_max_score")
        if row_max_score_raw:
            score_row["max_score"] = _parse_required_csv_float(
                row_max_score_raw,
                "submission_max_score",
                line_number,
            )

        tests[test_key]["scores"].append(score_row)

    if data_rows == 0:
        raise ValueError("CSV has no data rows.")

    try:
        return SimpleScoresIngestionRequest.model_validate(
            {
                "class_name": class_name,
                "subject": subject,
                "term": term,
                "tests": list(tests.values()),
            }
        )
    except ValidationError as exc:
        raise ValueError(f"CSV validation failed: {exc}") from exc


@router.post("/auth/sign-in", response_model=AuthTokenResponse)
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
    "/auth/sign-up",
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


@router.get("/auth/me", response_model=TeacherRead)
def auth_me(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Teacher:
    return _get_teacher_from_auth_header(authorization, db)


@router.post("/quiz/generate", response_model=QuizGenerationResponse)
def generate_quiz(payload: QuizGenerationRequest) -> dict[str, str]:
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
def generate_what_if(payload: WhatIfQuestionRequest) -> dict[str, str]:
    try:
        question = generate_what_if_question(payload.topic)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"What-if generation failed: {exc}") from exc

    return {"question": question.strip()}


@router.post("/quiz/docs", response_model=QuizDocumentRead, status_code=status.HTTP_201_CREATED)
def create_quiz_doc(payload: QuizDocumentCreate, db: Session = Depends(get_db)) -> QuizDocument:
    if payload.class_id is not None:
        classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id))
        _ensure_exists(classroom, "Class not found.")

    document = QuizDocument(**payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("/quiz/docs", response_model=list[QuizDocumentRead])
def list_quiz_docs(
    class_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[QuizDocument]:
    query = select(QuizDocument).order_by(QuizDocument.created_at.desc())
    if class_id is not None:
        query = query.where(QuizDocument.class_id == class_id)
    return db.scalars(query).all()


@router.get("/quiz/docs/{doc_id}", response_model=QuizDocumentRead)
def get_quiz_doc(doc_id: int, db: Session = Depends(get_db)) -> QuizDocument:
    document = db.scalar(select(QuizDocument).where(QuizDocument.id == doc_id))
    return _ensure_exists(document, "Quiz document not found.")  # type: ignore[return-value]


@router.delete("/quiz/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz_doc(doc_id: int, db: Session = Depends(get_db)) -> None:
    document = db.scalar(select(QuizDocument).where(QuizDocument.id == doc_id))
    document = _ensure_exists(document, "Quiz document not found.")  # type: ignore[assignment]
    db.delete(document)  # type: ignore[arg-type]
    db.commit()


@router.post("/teachers", response_model=TeacherRead, status_code=status.HTTP_201_CREATED)
def create_teacher(payload: TeacherCreate, db: Session = Depends(get_db)) -> Teacher:
    exists = db.scalar(select(Teacher).where(Teacher.email == payload.email))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Teacher with this email already exists.")

    teacher = Teacher(email=payload.email, full_name=payload.full_name)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


@router.get("/teachers", response_model=list[TeacherRead])
def list_teachers(db: Session = Depends(get_db)) -> list[Teacher]:
    return db.scalars(select(Teacher).order_by(Teacher.created_at.desc())).all()


@router.get("/teachers/{teacher_id}", response_model=TeacherRead)
def get_teacher(teacher_id: int, db: Session = Depends(get_db)) -> Teacher:
    teacher = db.scalar(select(Teacher).where(Teacher.id == teacher_id))
    return _ensure_exists(teacher, "Teacher not found.")  # type: ignore[return-value]


@router.post("/classes", response_model=ClassroomRead, status_code=status.HTTP_201_CREATED)
def create_classroom(payload: ClassroomCreate, db: Session = Depends(get_db)) -> Classroom:
    teacher = db.scalar(select(Teacher).where(Teacher.id == payload.teacher_id))
    _ensure_exists(teacher, "Teacher not found.")

    classroom = Classroom(**payload.model_dump())
    db.add(classroom)
    db.commit()
    db.refresh(classroom)
    return classroom


@router.get("/classes", response_model=list[ClassroomRead])
def list_classes(
    teacher_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Classroom]:
    query = select(Classroom).order_by(Classroom.created_at.desc())
    if teacher_id is not None:
        query = query.where(Classroom.teacher_id == teacher_id)
    return db.scalars(query).all()


@router.get("/classes/{class_id}", response_model=ClassroomRead)
def get_classroom(class_id: int, db: Session = Depends(get_db)) -> Classroom:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    return _ensure_exists(classroom, "Class not found.")  # type: ignore[return-value]


@router.post("/students", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def create_student(payload: StudentCreate, db: Session = Depends(get_db)) -> Student:
    classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id))
    _ensure_exists(classroom, "Class not found.")

    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.get("/students", response_model=list[StudentRead])
def list_students(class_id: int = Query(...), db: Session = Depends(get_db)) -> list[Student]:
    return db.scalars(select(Student).where(Student.class_id == class_id).order_by(Student.full_name)).all()


@router.get("/students/{student_id}", response_model=StudentRead)
def get_student(student_id: int, db: Session = Depends(get_db)) -> Student:
    student = db.scalar(select(Student).where(Student.id == student_id))
    return _ensure_exists(student, "Student not found.")  # type: ignore[return-value]


@router.post("/assignments", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def create_assignment(payload: AssignmentCreate, db: Session = Depends(get_db)) -> Assignment:
    classroom = db.scalar(select(Classroom).where(Classroom.id == payload.class_id))
    _ensure_exists(classroom, "Class not found.")

    assignment = Assignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/assignments", response_model=list[AssignmentRead])
def list_assignments(class_id: int = Query(...), db: Session = Depends(get_db)) -> list[Assignment]:
    return db.scalars(select(Assignment).where(Assignment.class_id == class_id).order_by(Assignment.due_at, Assignment.id)).all()


@router.post("/submissions", response_model=SubmissionRead, status_code=status.HTTP_201_CREATED)
def upsert_submission(payload: SubmissionCreate, db: Session = Depends(get_db)) -> Submission:
    assignment = db.scalar(select(Assignment).where(Assignment.id == payload.assignment_id))
    student = db.scalar(select(Student).where(Student.id == payload.student_id))
    _ensure_exists(assignment, "Assignment not found.")
    _ensure_exists(student, "Student not found.")

    if assignment.class_id != student.class_id:  # type: ignore[union-attr]
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
    db: Session = Depends(get_db),
) -> list[Submission]:
    query = select(Submission)
    if class_id is not None:
        query = query.join(Assignment, Submission.assignment_id == Assignment.id).where(Assignment.class_id == class_id)
    if assignment_id is not None:
        query = query.where(Submission.assignment_id == assignment_id)
    if student_id is not None:
        query = query.where(Submission.student_id == student_id)
    return db.scalars(query.order_by(Submission.created_at.desc())).all()


@router.post("/notes", response_model=TeacherNoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: TeacherNoteCreate, db: Session = Depends(get_db)) -> TeacherNote:
    teacher = db.scalar(select(Teacher).where(Teacher.id == payload.teacher_id))
    student = db.scalar(select(Student).where(Student.id == payload.student_id))
    _ensure_exists(teacher, "Teacher not found.")
    _ensure_exists(student, "Student not found.")

    note = TeacherNote(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/students/{student_id}/notes", response_model=list[TeacherNoteRead])
def list_student_notes(student_id: int, db: Session = Depends(get_db)) -> list[TeacherNote]:
    return db.scalars(
        select(TeacherNote).where(TeacherNote.student_id == student_id).order_by(TeacherNote.created_at.desc())
    ).all()


@router.post("/ingestion/structured", response_model=IngestionSummary, status_code=status.HTTP_201_CREATED)
def ingest_structured(payload: StructuredIngestionRequest, db: Session = Depends(get_db)) -> dict[str, int]:
    return ingest_structured_data(db, payload)


@router.post(
    "/ingestion/scores",
    response_model=SimpleScoresIngestionSummary,
    status_code=status.HTTP_201_CREATED,
)
def ingest_scores(
    payload: SimpleScoresIngestionRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    teacher = _get_teacher_from_auth_header(authorization, db)
    try:
        return ingest_simple_scores(db, teacher, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/ingestion/scores/csv",
    response_model=SimpleScoresIngestionSummary,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_scores_csv(
    file: UploadFile = File(...),
    class_name: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    term: str | None = Form(default=None),
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .csv files are allowed.")

    raw_csv = await file.read()
    if not raw_csv:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty.")

    try:
        csv_text = raw_csv.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must be UTF-8 encoded.",
        ) from exc

    try:
        payload = _build_simple_scores_payload_from_csv(
            csv_text,
            class_name_override=class_name,
            subject_override=subject,
            term_override=term,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    teacher = _get_teacher_from_auth_header(authorization, db)
    try:
        return ingest_simple_scores(db, teacher, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/analytics/classes/{class_id}/dashboard", response_model=ClassDashboardResponse)
def get_class_dashboard(class_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return class_dashboard(db, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/analytics/classes/{class_id}/concept-insights", response_model=ConceptInsightsResponse)
def get_class_concept_insights(class_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return concept_insights(db, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/analytics/classes/{class_id}/risk-signals", response_model=RiskSignalsResponse)
def get_class_risk_signals(
    class_id: int,
    persist: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return risk_signals(db, class_id, persist=persist)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/analytics/students/{student_id}/profile", response_model=StudentProfileResponse)
def get_student_profile(student_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return student_profile(db, student_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/classes/{class_id}/insights")
def list_insights(class_id: int, db: Session = Depends(get_db)) -> list[dict]:
    insights = db.scalars(
        select(Insight).where(Insight.class_id == class_id).order_by(Insight.created_at.desc())
    ).all()
    return [
        {
            "id": insight.id,
            "class_id": insight.class_id,
            "student_id": insight.student_id,
            "insight_type": insight.insight_type,
            "severity": insight.severity,
            "payload_json": insight.payload_json,
            "is_resolved": insight.is_resolved,
            "created_at": insight.created_at,
        }
        for insight in insights
    ]


@router.patch("/insights/{insight_id}/resolve")
def resolve_insight(insight_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    insight = db.scalar(select(Insight).where(Insight.id == insight_id))
    insight = _ensure_exists(insight, "Insight not found.")  # type: ignore[assignment]
    insight.is_resolved = True  # type: ignore[union-attr]
    db.commit()
    return {"status": "resolved"}


@router.get("/classes/{class_id}/summary")
def class_summary(class_id: int, db: Session = Depends(get_db)) -> dict[str, int]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
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
