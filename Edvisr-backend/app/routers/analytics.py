from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.analytics import class_dashboard, concept_insights, risk_signals, student_profile
from app.database import get_db
from app.deps import get_current_teacher
from app.models import Classroom, Insight, Student, Teacher
from app.schemas import (
    ClassDashboardResponse,
    ConceptInsightsResponse,
    RiskSignalsResponse,
    StudentProfileResponse,
    InsightRead,
)
from app.recommendations import get_intervention_recommendations
from app.analytics import _student_weak_concepts
from app.models import Submission

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(get_current_teacher)])

def _ensure_class_access(class_id: int, teacher: Teacher, db: Session) -> Classroom:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher.id))
    if classroom is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found.")
    return classroom

@router.get("/dashboard/overview")
def get_dashboard_overview(teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[dict]:
    classes = db.scalars(select(Classroom).where(Classroom.teacher_id == teacher.id)).all()
    overviews = []
    for cls in classes:
        try:
            dashboard = class_dashboard(db, cls.id)
            risk = risk_signals(db, cls.id, persist=False)
            dashboard["flagged_students"] = risk["flagged_students"]
            overviews.append(dashboard)
        except ValueError:
            pass
    return overviews

@router.get("/alerts/count")
def get_alerts_count(teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict[str, int]:
    count = db.scalar(
        select(func.count(Insight.id))
        .join(Classroom, Insight.class_id == Classroom.id)
        .where(
            Classroom.teacher_id == teacher.id,
            Insight.is_resolved.is_(False),
            Insight.insight_type == "early_intervention"
        )
    )
    return {"count": int(count or 0)}

@router.get("/alerts", response_model=list[InsightRead])
def get_all_alerts(teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[Insight]:
    insights = db.scalars(
        select(Insight)
        .join(Classroom, Insight.class_id == Classroom.id)
        .where(
            Classroom.teacher_id == teacher.id,
            Insight.is_resolved.is_(False),
            Insight.insight_type == "early_intervention"
        )
        .order_by(Insight.created_at.desc())
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

@router.get("/classes/{class_id}/dashboard", response_model=ClassDashboardResponse)
def get_class_dashboard(class_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict:
    _ensure_class_access(class_id, teacher, db)
    try:
        return class_dashboard(db, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

@router.get("/classes/{class_id}/concept-insights", response_model=ConceptInsightsResponse)
def get_class_concept_insights(class_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict:
    _ensure_class_access(class_id, teacher, db)
    try:
        return concept_insights(db, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

@router.get("/classes/{class_id}/risk-signals", response_model=RiskSignalsResponse)
def get_class_risk_signals(
    class_id: int,
    persist: bool = Query(default=False),
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> dict:
    _ensure_class_access(class_id, teacher, db)
    try:
        return risk_signals(db, class_id, persist=persist)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

@router.get("/students/{student_id}/profile", response_model=StudentProfileResponse)
def get_student_profile(student_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict:
    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == student_id, Classroom.teacher_id == teacher.id)
    )
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    try:
        return student_profile(db, student_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

@router.get("/students/{student_id}/recommendations")
def get_student_recommendations(
    student_id: int, 
    teacher: Teacher = Depends(get_current_teacher), 
    db: Session = Depends(get_db)
) -> dict:
    student = db.scalar(
        select(Student)
        .join(Classroom, Student.class_id == Classroom.id)
        .where(Student.id == student_id, Classroom.teacher_id == teacher.id)
    )
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    try:
        profile = student_profile(db, student_id)
        submissions = db.scalars(select(Submission).where(Submission.student_id == student_id)).all()
        weak_concepts = _student_weak_concepts(list(submissions))
        
        recommendations = get_intervention_recommendations(
            student_name=student.full_name,
            trend=profile["trend"],
            average_pct=profile["average_score_pct"],
            weak_concepts=weak_concepts
        )
        return {"recommendations": recommendations}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

@router.get("/classes/{class_id}/insights")
def list_insights(class_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> list[dict]:
    _ensure_class_access(class_id, teacher, db)
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
def resolve_insight(insight_id: int, teacher: Teacher = Depends(get_current_teacher), db: Session = Depends(get_db)) -> dict[str, str]:
    insight = db.scalar(
        select(Insight)
        .join(Classroom, Insight.class_id == Classroom.id)
        .where(Insight.id == insight_id, Classroom.teacher_id == teacher.id)
    )
    if insight is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insight not found.")
    
    insight.is_resolved = True
    db.commit()
    return {"status": "resolved"}
