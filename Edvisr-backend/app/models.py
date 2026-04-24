from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    classes: Mapped[list["Classroom"]] = relationship(back_populates="teacher", cascade="all, delete-orphan")
    notes: Mapped[list["TeacherNote"]] = relationship(back_populates="teacher", cascade="all, delete-orphan")
    credential: Mapped["TeacherCredential | None"] = relationship(
        back_populates="teacher",
        cascade="all, delete-orphan",
        uselist=False,
    )


class TeacherCredential(Base):
    __tablename__ = "teacher_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    teacher: Mapped["Teacher"] = relationship(back_populates="credential")


class Classroom(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(255))
    term: Mapped[str | None] = mapped_column(String(120))
    platform_source: Mapped[str | None] = mapped_column(String(120))
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    teacher: Mapped["Teacher"] = relationship(back_populates="classes")
    students: Mapped[list["Student"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    insights: Mapped[list["Insight"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("class_id", "roll_number", name="uq_students_class_roll"),
        UniqueConstraint("class_id", "external_id", name="uq_students_class_external"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255))
    roll_number: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    external_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    classroom: Mapped["Classroom"] = relationship(back_populates="students")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    notes: Mapped[list["TeacherNote"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    insights: Mapped[list["Insight"]] = relationship(back_populates="student")


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("class_id", "external_id", name="uq_assignments_class_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255))
    external_id: Mapped[str | None] = mapped_column(String(255))
    max_score: Mapped[float] = mapped_column(Float, default=100.0)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    classroom: Mapped["Classroom"] = relationship(back_populates="assignments")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), index=True, nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="submitted", nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    raw_score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    rubric_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    question_responses_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    student: Mapped["Student"] = relationship(back_populates="submissions")


class TeacherNote(Base):
    __tablename__ = "teacher_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), index=True, nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True, nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)
    intervention_action: Mapped[str | None] = mapped_column(Text)
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    teacher: Mapped["Teacher"] = relationship(back_populates="notes")
    student: Mapped["Student"] = relationship(back_populates="notes")


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True, nullable=False)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), index=True)
    insight_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    classroom: Mapped["Classroom"] = relationship(back_populates="insights")
    student: Mapped["Student"] = relationship(back_populates="insights")


class QuizDocument(Base):
    __tablename__ = "quiz_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    grade: Mapped[str] = mapped_column(String(50))
    topic: Mapped[str] = mapped_column(String(255))
    difficulty: Mapped[str] = mapped_column(String(50))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
