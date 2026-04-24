from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .models import Assignment, Classroom, Insight, Student, Submission, TeacherNote

DECLINING_MIN_TOTAL_DROP_RATIO = 0.15
CRITICAL_LATEST_SCORE_RATIO = 0.30
RISK_TYPE_PRIORITY = {
    "Critical": 0,
    "Declining": 1,
    "Low Avg": 2,
}


@dataclass
class _StudentMetrics:
    average_ratio: float | None
    missing_rate: float
    missing_count: int
    declining_last_three: bool
    signals: list[str]


def _score_ratio(raw_score: float | None, max_score: float | None) -> float | None:
    if raw_score is None or max_score is None or max_score <= 0:
        return None
    return raw_score / max_score


def _trend_label(values: list[float]) -> str:
    if len(values) < 2:
        return "insufficient_data"
    midpoint = max(1, len(values) // 2)
    first_half = float(np.mean(values[:midpoint]))
    second_half = float(np.mean(values[midpoint:]))
    delta = second_half - first_half
    if delta >= settings.decline_threshold:
        return "improving"
    if delta <= -settings.decline_threshold:
        return "declining"
    return "stable"


def _suggest_intervention(signals: list[str], weak_concepts: list[str]) -> str:
    if weak_concepts:
        return f"Focus reteaching on {', '.join(weak_concepts[:3])} with short formative checks."
    if "critical_latest_score" in signals:
        return "Latest score dropped below 30%; schedule immediate 1:1 intervention."
    if "missing_submissions" in signals:
        return "Schedule a check-in and create a submission recovery plan."
    if "declining_trend" in signals:
        return "Provide targeted remediation on recent units and monitor next quiz."
    if "underperformance" in signals:
        return "Provide additional practice and concept-level support."
    return "Monitor progress weekly."


def _primary_risk(signals: list[str], average_ratio: float | None, missing_count: int) -> tuple[str, str]:
    if "missing_submissions" in signals:
        return "Missing", f"{missing_count} missed submissions."
    if "critical_latest_score" in signals:
        return "Critical", "Latest score is below 30%."
    if "declining_trend" in signals:
        return "Declining", "3 consecutive drops (>=15 pts) with current score below class average or below 50%."
    if "underperformance" in signals:
        pct = round((average_ratio or 0.0) * 100, 1)
        return "Low Avg", f"Overall average is {pct}% (below 50%)."
    return "Stable", "No risk signals triggered."


def class_dashboard(db: Session, class_id: int) -> dict[str, Any]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise ValueError("Class not found")

    students = db.scalars(select(Student).where(Student.class_id == class_id)).all()
    assignments = db.scalars(
        select(Assignment).where(Assignment.class_id == class_id).order_by(Assignment.due_at, Assignment.id)
    ).all()

    submissions = db.scalars(
        select(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.class_id == class_id)
    ).all()

    ratios = [_score_ratio(s.raw_score, s.max_score) for s in submissions]
    valid_ratios = [value for value in ratios if value is not None]
    class_average_ratio = float(np.mean(valid_ratios)) if valid_ratios else None
    average_score_pct = round((class_average_ratio or 0.0) * 100, 2)

    expected_submissions = len(students) * len(assignments)
    submitted_count = len([s for s in submissions if s.status in {"submitted", "late"}])
    submission_rate_pct = round((submitted_count / expected_submissions) * 100, 2) if expected_submissions else 0.0

    score_distribution = {"90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "Below 60": 0}
    for ratio in valid_ratios:
        pct = ratio * 100
        if pct >= 90:
            score_distribution["90-100"] += 1
        elif pct >= 80:
            score_distribution["80-89"] += 1
        elif pct >= 70:
            score_distribution["70-79"] += 1
        elif pct >= 60:
            score_distribution["60-69"] += 1
        else:
            score_distribution["Below 60"] += 1

    trend = []
    for assignment in assignments:
        assignment_submissions = [s for s in submissions if s.assignment_id == assignment.id]
        assignment_ratios = [_score_ratio(s.raw_score, s.max_score) for s in assignment_submissions]
        valid = [value for value in assignment_ratios if value is not None]
        avg_pct = round(float(np.mean(valid) * 100), 2) if valid else 0.0
        sub_rate = round((len([s for s in assignment_submissions if s.status in {"submitted", "late"}]) / len(students)) * 100, 2) if students else 0.0
        trend.append(
            {
                "assignment_id": assignment.id,
                "assignment_title": assignment.title,
                "average_score_pct": avg_pct,
                "submission_rate": sub_rate,
                "due_at": assignment.due_at,
            }
        )

    submissions_by_student: dict[int, list[Submission]] = defaultdict(list)
    for submission in submissions:
        submissions_by_student[submission.student_id].append(submission)

    at_risk_students = 0
    for student in students:
        metrics = _student_metrics(assignments, submissions_by_student.get(student.id, []), class_average_ratio)
        if metrics.signals:
            at_risk_students += 1

    return {
        "class_id": classroom.id,
        "class_name": classroom.name,
        "subject": classroom.subject,
        "total_students": len(students),
        "total_assignments": len(assignments),
        "average_score_pct": average_score_pct,
        "submission_rate_pct": submission_rate_pct,
        "at_risk_students": at_risk_students,
        "score_distribution": [{"label": label, "count": count} for label, count in score_distribution.items()],
        "trend": trend,
    }


def _student_metrics(
    assignments: list[Assignment],
    submissions: list[Submission],
    class_average_ratio: float | None,
) -> _StudentMetrics:
    assignment_order = {assignment.id: idx for idx, assignment in enumerate(assignments)}
    sorted_submissions = sorted(submissions, key=lambda item: assignment_order.get(item.assignment_id, 10_000))
    ratios = [_score_ratio(item.raw_score, item.max_score) for item in sorted_submissions if item.status in {"submitted", "late"}]
    valid_ratios = [value for value in ratios if value is not None]

    average_ratio = float(np.mean(valid_ratios)) if valid_ratios else None

    declining_last_three = False
    if len(valid_ratios) >= 3:
        last_three = valid_ratios[-3:]
        consecutive_drop = last_three[0] > last_three[1] > last_three[2]
        total_drop = last_three[0] - last_three[2]
        final_score = last_three[2]
        below_class_average = class_average_ratio is not None and final_score < class_average_ratio
        below_floor = final_score < 0.50
        declining_last_three = (
            consecutive_drop
            and total_drop >= DECLINING_MIN_TOTAL_DROP_RATIO
            and (below_class_average or below_floor)
        )

    total_assignments = len(assignments)
    submitted = len([item for item in sorted_submissions if item.status in {"submitted", "late"}])
    missing_count = max(total_assignments - submitted, 0)
    missing_rate = (missing_count / total_assignments) if total_assignments else 0.0

    signals = []
    if average_ratio is not None and average_ratio < 0.50:
        signals.append("underperformance")
    if valid_ratios and valid_ratios[-1] < CRITICAL_LATEST_SCORE_RATIO:
        signals.append("critical_latest_score")
    if declining_last_three:
        signals.append("declining_trend")
    if missing_count >= 3:
        signals.append("missing_submissions")

    return _StudentMetrics(
        average_ratio=average_ratio,
        missing_rate=missing_rate,
        missing_count=missing_count,
        declining_last_three=declining_last_three,
        signals=signals,
    )


def _student_weak_concepts(submissions: list[Submission]) -> list[str]:
    concept_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for submission in submissions:
        responses = submission.question_responses_json or []
        for item in responses:
            concept = str(item.get("concept") or "Uncategorized")
            is_correct = item.get("is_correct")
            if is_correct is None:
                score = item.get("score")
                max_score = item.get("max_score")
                if isinstance(score, (int, float)) and isinstance(max_score, (int, float)) and max_score > 0:
                    is_correct = (score / max_score) >= 0.5
            concept_stats[concept][1] += 1
            if is_correct is True:
                concept_stats[concept][0] += 1

    weak_candidates: list[tuple[str, float, int]] = []
    for concept, (correct, attempts) in concept_stats.items():
        if attempts < 2:
            continue
        accuracy = correct / attempts
        if accuracy < settings.weak_concept_accuracy_threshold:
            weak_candidates.append((concept, accuracy, attempts))

    weak_candidates.sort(key=lambda item: (item[1], -item[2], item[0]))
    return [item[0] for item in weak_candidates[:3]]


def risk_signals(db: Session, class_id: int, persist: bool = False) -> dict[str, Any]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise ValueError("Class not found")

    students = db.scalars(select(Student).where(Student.class_id == class_id).order_by(Student.full_name)).all()
    assignments = db.scalars(select(Assignment).where(Assignment.class_id == class_id).order_by(Assignment.due_at, Assignment.id)).all()
    submissions = db.scalars(
        select(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.class_id == class_id)
    ).all()
    class_ratios = [_score_ratio(s.raw_score, s.max_score) for s in submissions]
    valid_class_ratios = [ratio for ratio in class_ratios if ratio is not None]
    class_average_ratio = float(np.mean(valid_class_ratios)) if valid_class_ratios else None

    submissions_by_student: dict[int, list[Submission]] = defaultdict(list)
    for submission in submissions:
        submissions_by_student[submission.student_id].append(submission)

    if persist:
        db.execute(
            delete(Insight).where(
                Insight.class_id == class_id,
                Insight.insight_type == "early_intervention",
                Insight.is_resolved.is_(False),
            )
        )

    signals_payload = []
    flagged_students = 0
    for student in students:
        student_submissions = submissions_by_student.get(student.id, [])
        metrics = _student_metrics(assignments, student_submissions, class_average_ratio)
        weak_concepts = _student_weak_concepts(student_submissions)
        risk_type, reason = _primary_risk(metrics.signals, metrics.average_ratio, metrics.missing_count)

        risk_score = 0.0
        if "underperformance" in metrics.signals:
            risk_score += 0.40
        if "critical_latest_score" in metrics.signals:
            risk_score += 0.40
        if "declining_trend" in metrics.signals:
            risk_score += 0.45
        if "missing_submissions" in metrics.signals:
            risk_score += 0.35
        risk_score = min(risk_score, 1.0)

        if risk_score >= 0.75:
            risk_level = "high"
        elif risk_score >= 0.35:
            risk_level = "medium"
        else:
            risk_level = "low"

        if metrics.signals:
            flagged_students += 1

        student_signal = {
            "student_id": student.id,
            "student_name": student.full_name,
            "class_id": class_id,
            "risk_level": risk_level,
            "risk_score": round(risk_score, 2),
            "risk_type": risk_type,
            "reason": reason,
            "average_score_pct": round(metrics.average_ratio * 100, 2) if metrics.average_ratio is not None else None,
            "missing_submission_rate": round(metrics.missing_rate, 2),
            "signals": metrics.signals,
            "weak_concepts": weak_concepts,
            "suggested_intervention": _suggest_intervention(metrics.signals, weak_concepts),
        }
        signals_payload.append(student_signal)

        if persist and metrics.signals:
            db.add(
                Insight(
                    class_id=class_id,
                    student_id=student.id,
                    insight_type="early_intervention",
                    severity=risk_level,
                    payload_json=student_signal,
                )
            )

    if persist:
        db.commit()

    signals_payload.sort(
        key=lambda item: (
            RISK_TYPE_PRIORITY.get(str(item.get("risk_type")), 3),
            -float(item.get("risk_score", 0.0)),
            str(item.get("student_name", "")).lower(),
        )
    )

    return {
        "class_id": class_id,
        "total_students": len(students),
        "flagged_students": flagged_students,
        "signals": signals_payload,
    }


def concept_insights(db: Session, class_id: int) -> dict[str, Any]:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise ValueError("Class not found")

    assignments = db.scalars(
        select(Assignment).where(Assignment.class_id == class_id)
    ).all()
    assignment_by_id = {assignment.id: assignment for assignment in assignments}

    submissions = db.scalars(
        select(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.class_id == class_id)
    ).all()

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"attempts": 0, "correct": 0, "score_sum": 0.0, "max_sum": 0.0, "errors": Counter()}
    )
    has_concept_responses = False

    for submission in submissions:
        responses = submission.question_responses_json or []
        if responses:
            has_concept_responses = True
        for item in responses:
            concept = item.get("concept") or "Uncategorized"
            score = item.get("score")
            max_score = item.get("max_score")
            is_correct = item.get("is_correct")
            error_tag = item.get("error_tag")

            buckets[concept]["attempts"] += 1
            if is_correct is True:
                buckets[concept]["correct"] += 1
            elif is_correct is None and isinstance(score, (int, float)) and isinstance(max_score, (int, float)) and max_score > 0:
                buckets[concept]["correct"] += int((score / max_score) >= 0.5)

            if isinstance(score, (int, float)) and isinstance(max_score, (int, float)) and max_score > 0:
                buckets[concept]["score_sum"] += float(score)
                buckets[concept]["max_sum"] += float(max_score)

            if error_tag:
                buckets[concept]["errors"][str(error_tag)] += 1

    # Fallback for score-only datasets where no question-level concept tags are present.
    if not has_concept_responses:
        for submission in submissions:
            if submission.status not in {"submitted", "late"}:
                continue
            assignment = assignment_by_id.get(submission.assignment_id)
            concept = assignment.title if assignment is not None else "Assessment"
            max_score = submission.max_score or (assignment.max_score if assignment is not None else None)
            ratio = _score_ratio(submission.raw_score, max_score)
            if ratio is None:
                continue
            buckets[concept]["attempts"] += 1
            buckets[concept]["correct"] += int(ratio >= 0.5)
            buckets[concept]["score_sum"] += float(submission.raw_score or 0.0)
            buckets[concept]["max_sum"] += float(max_score)

    concepts = []
    for concept, agg in buckets.items():
        attempts = agg["attempts"]
        accuracy_pct = round((agg["correct"] / attempts) * 100, 2) if attempts else 0.0
        avg_score_pct = round((agg["score_sum"] / agg["max_sum"]) * 100, 2) if agg["max_sum"] else 0.0
        if avg_score_pct < settings.weak_concept_score_threshold:
            weakness_level = "high"
        elif avg_score_pct < 75:
            weakness_level = "medium"
        else:
            weakness_level = "low"
        common_errors = [name for name, _ in agg["errors"].most_common(3)]
        concepts.append(
            {
                "concept": concept,
                "attempts": attempts,
                "accuracy_pct": accuracy_pct,
                "average_score_pct": avg_score_pct,
                "weak_concept": avg_score_pct < settings.weak_concept_score_threshold,
                "weakness_level": weakness_level,
                "common_error_tags": common_errors,
            }
        )

    concepts.sort(key=lambda entry: (entry["average_score_pct"], -entry["attempts"]))
    return {"class_id": class_id, "concepts": concepts}


def student_profile(db: Session, student_id: int) -> dict[str, Any]:
    student = db.scalar(
        select(Student)
        .where(Student.id == student_id)
        .options(selectinload(Student.classroom))
    )
    if student is None:
        raise ValueError("Student not found")

    assignments = db.scalars(
        select(Assignment)
        .where(Assignment.class_id == student.class_id)
        .order_by(Assignment.due_at, Assignment.id)
    ).all()
    submissions = db.scalars(select(Submission).where(Submission.student_id == student_id)).all()
    submissions_by_assignment = {submission.assignment_id: submission for submission in submissions}

    progress = []
    ratios: list[float] = []
    submitted_count = 0
    for assignment in assignments:
        submission = submissions_by_assignment.get(assignment.id)
        if submission is None:
            progress.append(
                {
                    "assignment_id": assignment.id,
                    "assignment_title": assignment.title,
                    "due_at": assignment.due_at,
                    "status": "missing",
                    "score_pct": None,
                }
            )
            continue

        ratio = _score_ratio(submission.raw_score, submission.max_score)
        if ratio is not None:
            ratios.append(ratio)
        if submission.status in {"submitted", "late"}:
            submitted_count += 1
        progress.append(
            {
                "assignment_id": assignment.id,
                "assignment_title": assignment.title,
                "due_at": assignment.due_at,
                "status": submission.status,
                "score_pct": round(ratio * 100, 2) if ratio is not None else None,
            }
        )

    average_score_pct = round(float(np.mean(ratios) * 100), 2) if ratios else None
    class_submissions = db.scalars(
        select(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.class_id == student.class_id)
    ).all()
    class_ratios = [_score_ratio(item.raw_score, item.max_score) for item in class_submissions]
    valid_class_ratios = [ratio for ratio in class_ratios if ratio is not None]
    class_average_pct = round(float(np.mean(valid_class_ratios) * 100), 2) if valid_class_ratios else None
    class_average_delta_pct = (
        round(average_score_pct - class_average_pct, 2)
        if average_score_pct is not None and class_average_pct is not None
        else None
    )
    submission_rate_pct = round((submitted_count / len(assignments)) * 100, 2) if assignments else 0.0
    consistency_std = round(float(np.std(ratios)), 4) if len(ratios) > 1 else None
    trend = _trend_label(ratios)
    active_notes = db.scalar(
        select(func.count(TeacherNote.id)).where(
            TeacherNote.student_id == student_id,
            TeacherNote.is_resolved.is_(False),
        )
    )

    return {
        "student_id": student.id,
        "class_id": student.class_id,
        "student_name": student.full_name,
        "average_score_pct": average_score_pct,
        "class_average_delta_pct": class_average_delta_pct,
        "submission_rate_pct": submission_rate_pct,
        "consistency_std": consistency_std,
        "trend": trend,
        "active_notes": int(active_notes or 0),
        "progress": progress,
    }
