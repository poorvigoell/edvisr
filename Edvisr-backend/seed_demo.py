from datetime import datetime, timedelta, timezone
from random import Random

from app.database import Base, SessionLocal, engine
from app.ingestion import ingest_structured_data
from app.schemas import StructuredIngestionRequest


CONCEPT_ERRORS = {
    "cell_structure": "organelle_confusion",
    "mitochondria": "function_mismatch",
    "nucleus": "labeling_error",
    "osmosis": "process_confusion",
    "chemical_equations": "balancing_error",
    "acids_bases": "ph_scale_confusion",
    "periodic_trends": "trend_misread",
    "stoichiometry": "mole_ratio_error",
    "motion": "equation_selection",
    "force_and_friction": "free_body_error",
    "work_energy": "unit_conversion",
    "electricity_basics": "circuit_reasoning",
}


def _build_students() -> list[dict]:
    first_names = [
        "Aarav",
        "Vihaan",
        "Aditya",
        "Ishaan",
        "Krish",
        "Arnav",
        "Reyansh",
        "Anay",
        "Atharv",
        "Ayaan",
        "Rudra",
        "Dev",
        "Kiaan",
        "Parth",
        "Yash",
        "Rohan",
        "Samar",
        "Vivaan",
        "Dhruv",
        "Kabir",
        "Anika",
        "Diya",
        "Myra",
        "Sara",
        "Aadhya",
        "Meera",
        "Kiara",
        "Ira",
        "Tanvi",
        "Navya",
        "Riya",
        "Siya",
        "Naina",
        "Prisha",
        "Kavya",
        "Aisha",
        "Saanvi",
        "Anvi",
        "Mahi",
        "Tara",
    ]
    last_names = [
        "Patel",
        "Sharma",
        "Verma",
        "Nair",
        "Rao",
        "Kapoor",
        "Mehta",
        "Bansal",
        "Gupta",
        "Iyer",
        "Kulkarni",
        "Joshi",
        "Malhotra",
        "Saxena",
        "Pandey",
        "Mishra",
        "Aggarwal",
        "Singh",
        "Khurana",
        "Sethi",
        "Chawla",
        "Arora",
        "Bhatia",
        "Ghosh",
        "Dutta",
        "Pillai",
        "Reddy",
        "Chopra",
        "Desai",
        "Bhatt",
        "Sinha",
        "Menon",
        "Tripathi",
        "Bose",
        "Suri",
        "Tandon",
        "Nanda",
        "Ahluwalia",
        "Thakur",
        "Dubey",
    ]

    students: list[dict] = []
    for idx in range(40):
        roll = f"10A{idx + 1:02d}"
        full_name = f"{first_names[idx]} {last_names[idx]}"
        email = f"{first_names[idx].lower()}.{last_names[idx].lower()}@edvisr.demo"
        students.append(
            {
                "full_name": full_name,
                "roll_number": roll,
                "email": email,
                "external_id": f"s-{101 + idx}",
            }
        )
    return students


def build_demo_payload() -> StructuredIngestionRequest:
    now = datetime.now(timezone.utc)
    rng = Random(42)

    tests = [
        {
            "title": "Test 1 - Cell Biology Foundations",
            "external_id": "a-301",
            "max_score": 50,
            "published_at": now - timedelta(days=30),
            "due_at": now - timedelta(days=26),
            "concepts": ["cell_structure", "mitochondria", "nucleus", "osmosis"],
        },
        {
            "title": "Test 2 - Chemical Reactions",
            "external_id": "a-302",
            "max_score": 50,
            "published_at": now - timedelta(days=18),
            "due_at": now - timedelta(days=14),
            "concepts": ["chemical_equations", "acids_bases", "periodic_trends", "stoichiometry"],
        },
        {
            "title": "Test 3 - Motion and Energy",
            "external_id": "a-303",
            "max_score": 50,
            "published_at": now - timedelta(days=9),
            "due_at": now - timedelta(days=5),
            "concepts": ["motion", "force_and_friction", "work_energy", "electricity_basics"],
        },
    ]

    students = _build_students()
    concept_pool = list(CONCEPT_ERRORS.keys())
    profiles: dict[str, dict] = {}
    for student in students:
        ability = min(max(rng.gauss(0.66, 0.17), 0.22), 0.95)
        weak_count = 2 if ability < 0.60 else 1
        weak_concepts = set(rng.sample(concept_pool, k=weak_count))
        profiles[student["external_id"]] = {
            "ability": ability,
            "weak_concepts": weak_concepts,
        }

    assignment_payloads: list[dict] = []
    for test_index, test in enumerate(tests):
        submissions: list[dict] = []
        for student in students:
            external_id = student["external_id"]
            profile = profiles[external_id]
            ability = float(profile["ability"])
            weak_concepts = profile["weak_concepts"]

            miss_probability = 0.02 + max(0.0, 0.60 - ability) * 0.25 + (0.02 * test_index)
            if rng.random() < miss_probability:
                submissions.append(
                    {
                        "student_external_id": external_id,
                        "status": "missing",
                    }
                )
                continue

            late_probability = 0.04 + max(0.0, 0.56 - ability) * 0.18
            status = "late" if rng.random() < late_probability else "submitted"

            question_responses: list[dict] = []
            total_question_score = 0.0
            total_question_max = float(len(test["concepts"]) * 2)

            for question_number, concept in enumerate(test["concepts"], start=1):
                concept_strength = ability + rng.uniform(-0.08, 0.08)
                if concept in weak_concepts:
                    concept_strength -= 0.24
                concept_strength = min(max(concept_strength, 0.05), 0.98)

                is_correct = rng.random() < concept_strength
                if is_correct:
                    score = 2.0
                    error_tag = None
                else:
                    score = 1.0 if rng.random() < 0.22 else 0.0
                    error_tag = CONCEPT_ERRORS[concept]

                total_question_score += score
                question_responses.append(
                    {
                        "question_id": f"{test['external_id']}-q{question_number}",
                        "concept": concept,
                        "is_correct": is_correct,
                        "score": score,
                        "max_score": 2.0,
                        "error_tag": error_tag,
                    }
                )

            raw_score = round((total_question_score / total_question_max) * float(test["max_score"]), 1)
            submissions.append(
                {
                    "student_external_id": external_id,
                    "status": status,
                    "submitted_at": now - timedelta(days=max(0, 4 - test_index)),
                    "raw_score": raw_score,
                    "max_score": float(test["max_score"]),
                    "question_responses_json": question_responses,
                }
            )

        assignment_payloads.append(
            {
                "title": test["title"],
                "external_id": test["external_id"],
                "max_score": float(test["max_score"]),
                "published_at": test["published_at"],
                "due_at": test["due_at"],
                "submissions": submissions,
            }
        )

    return StructuredIngestionRequest(
        teacher={"email": "teacher@edvisr.demo", "full_name": "Aditi Sharma"},
        classroom={
            "name": "Class 10 - Section A",
            "subject": "Science",
            "term": "2026-Spring",
            "platform_source": "google_classroom",
            "external_id": "gc-class-10A",
        },
        students=students,
        assignments=assignment_payloads,
    )


def run() -> None:
    # Rebuild demo DB so each seed run gives one clean 40-student dataset.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    payload = build_demo_payload()
    db = SessionLocal()
    try:
        summary = ingest_structured_data(db, payload)
        print("Demo data loaded:", summary)
    finally:
        db.close()


if __name__ == "__main__":
    run()
