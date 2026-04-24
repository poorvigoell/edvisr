# EdVisr Backend (FastAPI)

## What this backend now provides
- Teacher, class, student, assignment, submission, and private teacher note APIs
- Structured classroom ingestion API (Google Classroom-like normalized payload)
- Simple score ingestion API (just class + test scores; app computes analytics/risk)
- Analytics APIs for:
  - Class dashboard
  - Concept-level insights
  - Early intervention risk signals (rule-based, transparent)
  - Student profile timelines

Risk rules used by `/api/analytics/classes/{class_id}/risk-signals`:
- Average score below 50%
- Last 3 scored assignments strictly decreasing
- Missed submissions >= 3

## Quick start
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs:
- Swagger: `http://127.0.0.1:8000/docs`
- OpenAPI: `http://127.0.0.1:8000/openapi.json`

## Seed demo data
```bash
python seed_demo.py
```

`seed_demo.py` now loads a 40-student class with roll numbers and 3 tests, including concept-level responses for weak-topic analytics.

Then call:
- `GET /api/teachers`
- `GET /api/classes?teacher_id=<id>`
- `POST /api/ingestion/scores`
- `GET /api/analytics/classes/<class_id>/dashboard`
- `GET /api/analytics/classes/<class_id>/risk-signals`
- `GET /api/analytics/classes/<class_id>/concept-insights`

## JWT sign-in
1. Create account and receive a token:
   - `POST /api/auth/sign-up`
   - body:
     ```json
     {
       "email": "newteacher@school.edu",
       "full_name": "New Teacher",
       "password": "your-password"
     }
     ```
   - A starter class (`My Class`) is created automatically for the new teacher.
1. Sign in and get a bearer token:
   - `POST /api/auth/sign-in`
   - body:
     ```json
     {
       "email": "teacher@edvisr.demo",
       "password": "edvisr123"
     }
     ```
2. Pass token in `Authorization` header for protected API calls:
   - `Authorization: Bearer <access_token>`

## Simple data input (class + scores only)
Use this if you only want to provide class/test scores and let EdVisr derive averages, weak students, and risk signals.

- `POST /api/ingestion/scores`
- example:
  ```json
  {
    "class_name": "Grade 10 A",
    "subject": "Math",
    "tests": [
      {
        "title": "Unit Test 1",
        "max_score": 100,
        "scores": [
          { "student_name": "Riya Patel", "score": 82 },
          { "student_name": "Arjun Verma", "score": 41 },
          { "student_name": "Meera Nair", "status": "missing" }
        ]
      }
    ]
  }
  ```

## Environment variables
- `DATABASE_URL` (default: `sqlite:///./edvisr.db`)
- `CORS_ORIGINS` (comma-separated)
- `AUTH_JWT_SECRET` (JWT signing key, change in production)
- `AUTH_ACCESS_TOKEN_EXP_MINUTES` (default `120`)
- `AUTH_DEMO_PASSWORD` (default `edvisr123`)
- `UNDERPERFORM_THRESHOLD` (default `0.55`)
- `DECLINE_THRESHOLD` (default `0.12`)
- `MISSING_SUBMISSION_THRESHOLD` (default `0.30`)
- `WEAK_CONCEPT_ACCURACY_THRESHOLD` (default `0.60`)
