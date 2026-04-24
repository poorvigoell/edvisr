from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class TeacherCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)


class TeacherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    created_at: datetime


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=255)


class SignUpRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=255)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    teacher: TeacherRead


class ClassroomCreate(BaseModel):
    teacher_id: int
    name: str = Field(min_length=2, max_length=255)
    subject: str = Field(min_length=2, max_length=255)
    term: str | None = None
    platform_source: str | None = None
    external_id: str | None = None


class ClassroomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    teacher_id: int
    name: str
    subject: str
    term: str | None
    platform_source: str | None
    external_id: str | None
    created_at: datetime


class StudentCreate(BaseModel):
    class_id: int
    full_name: str = Field(min_length=2, max_length=255)
    roll_number: str | None = None
    email: EmailStr | None = None
    external_id: str | None = None


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    full_name: str
    roll_number: str | None
    email: EmailStr | None
    external_id: str | None
    created_at: datetime


class AssignmentCreate(BaseModel):
    class_id: int
    title: str = Field(min_length=2, max_length=255)
    external_id: str | None = None
    max_score: float = Field(default=100.0, gt=0)
    due_at: datetime | None = None
    published_at: datetime | None = None


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    title: str
    external_id: str | None
    max_score: float
    due_at: datetime | None
    published_at: datetime | None
    created_at: datetime


class QuestionResponse(BaseModel):
    question_id: str | None = None
    concept: str | None = None
    is_correct: bool | None = None
    score: float | None = None
    max_score: float | None = None
    error_tag: str | None = None


class SubmissionCreate(BaseModel):
    assignment_id: int
    student_id: int
    status: Literal["submitted", "late", "missing"] = "submitted"
    submitted_at: datetime | None = None
    raw_score: float | None = None
    max_score: float | None = None
    rubric_json: dict[str, Any] | None = None
    question_responses_json: list[QuestionResponse] | None = None


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignment_id: int
    student_id: int
    status: str
    submitted_at: datetime | None
    raw_score: float | None
    max_score: float | None
    rubric_json: dict[str, Any] | None
    question_responses_json: list[dict[str, Any]] | None
    created_at: datetime


class TeacherNoteCreate(BaseModel):
    teacher_id: int
    student_id: int
    note_text: str = Field(min_length=3)
    intervention_action: str | None = None
    follow_up_date: date | None = None
    is_resolved: bool = False


class TeacherNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    teacher_id: int
    student_id: int
    note_text: str
    intervention_action: str | None
    follow_up_date: date | None
    is_resolved: bool
    created_at: datetime
    updated_at: datetime


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    student_id: int | None
    insight_type: str
    severity: str
    payload_json: dict[str, Any]
    is_resolved: bool
    created_at: datetime


class TrendPoint(BaseModel):
    assignment_id: int
    assignment_title: str
    average_score_pct: float
    submission_rate: float
    due_at: datetime | None


class ScoreBand(BaseModel):
    label: str
    count: int


class ClassDashboardResponse(BaseModel):
    class_id: int
    class_name: str
    subject: str
    total_students: int
    total_assignments: int
    average_score_pct: float
    submission_rate_pct: float
    at_risk_students: int
    score_distribution: list[ScoreBand]
    trend: list[TrendPoint]


class StudentRiskSignal(BaseModel):
    student_id: int
    student_name: str
    class_id: int
    risk_level: Literal["low", "medium", "high"]
    risk_score: float
    risk_type: str
    reason: str
    average_score_pct: float | None
    missing_submission_rate: float
    signals: list[str]
    weak_concepts: list[str]
    suggested_intervention: str


class RiskSignalsResponse(BaseModel):
    class_id: int
    total_students: int
    flagged_students: int
    signals: list[StudentRiskSignal]


class ConceptInsight(BaseModel):
    concept: str
    attempts: int
    accuracy_pct: float
    average_score_pct: float
    weak_concept: bool
    weakness_level: Literal["high", "medium", "low"]
    common_error_tags: list[str]


class ConceptInsightsResponse(BaseModel):
    class_id: int
    concepts: list[ConceptInsight]


class StudentProgressPoint(BaseModel):
    assignment_id: int
    assignment_title: str
    due_at: datetime | None
    status: str
    score_pct: float | None


class StudentProfileResponse(BaseModel):
    student_id: int
    class_id: int
    student_name: str
    average_score_pct: float | None
    class_average_delta_pct: float | None
    submission_rate_pct: float
    consistency_std: float | None
    trend: Literal["improving", "declining", "stable", "insufficient_data"]
    active_notes: int
    progress: list[StudentProgressPoint]


class IngestionTeacher(BaseModel):
    email: EmailStr
    full_name: str


class IngestionClassroom(BaseModel):
    name: str
    subject: str
    term: str | None = None
    platform_source: str | None = "google_classroom"
    external_id: str | None = None


class IngestionStudent(BaseModel):
    full_name: str
    roll_number: str | None = None
    email: EmailStr | None = None
    external_id: str | None = None


class IngestionSubmission(BaseModel):
    student_external_id: str | None = None
    student_roll_number: str | None = None
    student_email: EmailStr | None = None
    submitted_at: datetime | None = None
    status: Literal["submitted", "late", "missing"] = "submitted"
    raw_score: float | None = None
    max_score: float | None = None
    rubric_json: dict[str, Any] | None = None
    question_responses_json: list[QuestionResponse] | None = None


class IngestionAssignment(BaseModel):
    title: str
    external_id: str | None = None
    max_score: float = Field(default=100.0, gt=0)
    due_at: datetime | None = None
    published_at: datetime | None = None
    submissions: list[IngestionSubmission] = Field(default_factory=list)


class StructuredIngestionRequest(BaseModel):
    teacher: IngestionTeacher
    classroom: IngestionClassroom
    students: list[IngestionStudent]
    assignments: list[IngestionAssignment]


class IngestionSummary(BaseModel):
    teacher_id: int
    class_id: int
    students_created: int
    assignments_created: int
    submissions_created_or_updated: int
    unresolved_submission_rows: int


class ScoreRow(BaseModel):
    student_name: str = Field(min_length=2, max_length=255)
    roll_number: str | None = None
    email: EmailStr | None = None
    score: float | None = None
    status: Literal["submitted", "late", "missing"] = "submitted"
    max_score: float | None = Field(default=None, gt=0)


class TestScoresInput(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    max_score: float = Field(default=100.0, gt=0)
    due_at: datetime | None = None
    published_at: datetime | None = None
    scores: list[ScoreRow]


class SimpleScoresIngestionRequest(BaseModel):
    class_id: int | None = None
    class_name: str | None = Field(default=None, min_length=2, max_length=255)
    subject: str | None = Field(default=None, min_length=2, max_length=255)
    term: str | None = None
    tests: list[TestScoresInput]

    @model_validator(mode="after")
    def validate_class_source(self) -> "SimpleScoresIngestionRequest":
        if self.class_id is None and not self.class_name:
            raise ValueError("Provide either class_id or class_name.")
        if self.class_id is None and not self.subject:
            raise ValueError("subject is required when creating a class with class_name.")
        return self


class SimpleScoresIngestionSummary(BaseModel):
    class_id: int
    students_created: int
    assignments_created: int
    submissions_created_or_updated: int
    missing_submissions_marked: int


class QuizGenerationRequest(BaseModel):
    grade: str = Field(min_length=1, max_length=50)
    topic: str = Field(min_length=2, max_length=255)
    difficulty: str = Field(min_length=2, max_length=50)


class QuizGenerationResponse(BaseModel):
    content: str


class WhatIfQuestionRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=255)


class WhatIfQuestionResponse(BaseModel):
    question: str


class QuizDocumentCreate(BaseModel):
    class_id: int | None = None
    title: str = Field(min_length=3, max_length=255)
    grade: str = Field(min_length=1, max_length=50)
    topic: str = Field(min_length=2, max_length=255)
    difficulty: str = Field(min_length=2, max_length=50)
    content: str = Field(min_length=3)


class QuizDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int | None
    title: str
    grade: str
    topic: str
    difficulty: str
    content: str
    created_at: datetime
