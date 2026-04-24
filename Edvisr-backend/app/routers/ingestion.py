import csv
from datetime import datetime
from io import StringIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_teacher
from app.ingestion import ingest_simple_scores, ingest_structured_data
from app.models import Teacher
from app.schemas import (
    IngestionSummary,
    SimpleScoresIngestionRequest,
    SimpleScoresIngestionSummary,
    StructuredIngestionRequest,
)

router = APIRouter(prefix="/ingestion", tags=["ingestion"], dependencies=[Depends(get_current_teacher)])

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

    from pydantic import ValidationError
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


@router.post("/structured", response_model=IngestionSummary, status_code=status.HTTP_201_CREATED)
def ingest_structured(payload: StructuredIngestionRequest, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict[str, int]:
    # Security: Ensure the payload teacher email matches the authenticated teacher
    if payload.teacher.email != teacher.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot ingest data for another teacher.")
    return ingest_structured_data(db, payload)


@router.post(
    "/scores",
    response_model=SimpleScoresIngestionSummary,
    status_code=status.HTTP_201_CREATED,
)
def ingest_scores(
    payload: SimpleScoresIngestionRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    try:
        return ingest_simple_scores(db, teacher, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/scores/csv",
    response_model=SimpleScoresIngestionSummary,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_scores_csv(
    file: UploadFile = File(...),
    class_name: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    term: str | None = Form(default=None),
    teacher: Teacher = Depends(get_current_teacher),
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

    try:
        return ingest_simple_scores(db, teacher, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
