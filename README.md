# EdVisr

> AI-powered student academic risk platform for teachers.

EdVisr helps teachers identify struggling students early by ingesting classroom data, applying a rule-based risk classification engine, and surfacing concept-level performance insights — before it's too late to intervene.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Routes](#api-routes)
- [Key Design Decisions](#key-design-decisions)

---

## Overview

Teachers often don't realize a student is falling behind until it's reflected in a final exam. EdVisr solves this by continuously analyzing submission data and flagging at-risk students early — not just by average score, but by detecting declining trends and missing work patterns.

EdVisr provides:

- CSV-based classroom data ingestion with automatic student and assignment mapping
- A 3-signal rule-based engine that classifies students as Low / Medium / High risk
- Concept-level performance analytics showing *what* a student struggles with, not just *that* they struggle
- AI-generated intervention suggestions tailored to each student's weak concepts
- AI-powered quiz generation by topic and difficulty
- Customizable risk thresholds per teacher
- JWT-secured API with teacher-scoped access to all routes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL, SQLAlchemy ORM |
| AI | Groq API |
| Auth | JWT (JSON Web Tokens) |
| State Management | React Context API |

---

## Architecture

EdVisr follows a clean 2-tier architecture:

```
React + TypeScript Frontend (Vite)
              ↓
      FastAPI Backend  ←→  PostgreSQL
              ↓
        Groq AI
```

The backend is a single FastAPI service handling all routing, database operations, analytics computation, and AI integrations. The frontend communicates via REST API and stores JWT tokens in localStorage for authenticated requests.

---

## Features

### Risk Classification Engine
The core of EdVisr. For every student, the engine applies 3 independent risk signals:

| Signal | Condition |
|---|---|
| Underperformance | Average score < teacher-defined threshold (default 50%) |
| Declining Trend | Last 3 assignment average drops >15% vs overall average |
| Missing Work | Missing submissions / total assignments > 30% |

Students triggering multiple signals are classified as **High Risk** and surfaced at the top of the dashboard with color-coded tags.

### Concept-Level Insights
Assignments carry concept tags (e.g., "Algebra", "Cell Biology"). The analytics engine groups scores by concept and computes a weighted average per topic. Teachers see not just *that* a student is struggling, but *where* — enabling targeted intervention.

### CSV Ingestion
Teachers upload a CSV of classroom data. The backend parses each row, upserts students by name, creates assignment records, and maps submission scores. Missing submissions are stored with `status='missing'` and `raw_score=0` — actively tracked, not skipped.

### Welcome Wizard
On first login, if a teacher has no classes, the dashboard renders a step-by-step setup wizard instead of a blank screen. Once a class is created and data is uploaded, the full analytics dashboard is shown.

### AI Intervention Suggestions
For any at-risk student, the teacher can request AI-generated suggestions. The system sends the student's weak concepts and performance trend to the LLM with a structured prompt — returning a concept-aware, actionable 3-step study plan. Not generic advice.

### AI Quiz Generation
Teachers select a topic and difficulty level. The backend uses zero-shot prompting to generate a ready-to-use quiz in Markdown format via Groq.

### Teacher Preference Settings
Every teacher can customize their risk thresholds via range sliders in the Settings page. Changes are saved as a PATCH to the teacher's `preferences_json` column — no schema migration required. All analytics functions read from this dictionary at runtime, overriding hardcoded defaults.

---

## Project Structure

```
edvisr/
├── edvisr-backend/
│   ├── main.py                  # FastAPI entry point, router registration
│   ├── models.py                # SQLAlchemy ORM table definitions
│   ├── analytics.py             # Risk signals engine, concept mastery logic
│   ├── deps.py                  # get_current_teacher JWT dependency
│   ├── recommendations.py       # LLM-powered intervention suggestions
│   ├── quiz.py                  # LLM-powered quiz generation
│   └── routers/
│       ├── auth.py              # Signup, login, JWT issuance
│       ├── ingestion.py         # CSV upload and upsert logic
│       ├── analytics.py         # Dashboard overview endpoints
│       └── teachers.py          # Teacher profile and preferences
│
└── edvisr-frontend/
    ├── src/
    │   ├── TeacherContext.tsx   # Global state — teacher profile + classes
    │   ├── DashboardPage.tsx    # Main dashboard + Welcome Wizard
    │   ├── SettingsPage.tsx     # Threshold sliders, preference management
    │   └── ...
    ├── vite.config.ts
    └── package.json
```

---

## Database Schema

### `teachers`
Root user table. Stores name, email, hashed password, and a `preferences_json` JSONB column for flexible threshold storage.

### `classrooms`
Linked to a teacher via foreign key. Each teacher can have multiple classrooms.

### `students`
Linked to a classroom via foreign key. Created during CSV ingestion if they don't already exist.

### `assignments`
Linked to a classroom. Stores assignment name, concept tags, and due date.

### `submissions`
Linked to both a student and an assignment. Stores `raw_score` and `status` (`submitted` / `missing`). Core data point for all analytics.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL
- Groq

### Backend Setup

```bash
cd edvisr-backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`. Auto-generated API docs available at `http://localhost:8000/docs`.

### Frontend Setup

```bash
cd edvisr-frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs at `http://localhost:5173`.

### Database Setup

```bash
# Create PostgreSQL database
createdb edvisr

# Tables are created automatically on first run via SQLAlchemy
```

---

## Environment Variables

### Backend — create `edvisr-backend/.env`

```env
DATABASE_URL=postgresql://user:password@localhost:5432/edvisr
SECRET_KEY=your_jwt_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
GROQ_API_KEY=your_groq_api_key
```

### Frontend — create `edvisr-frontend/.env`

```env
VITE_API_URL=http://localhost:8000
```

---

## API Routes

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register a new teacher |
| POST | `/api/auth/login` | Login and receive JWT token |

### Teachers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/teachers/me` | Get current teacher profile |
| PATCH | `/api/teachers/me` | Update teacher preferences |

### Ingestion
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ingestion/import/csv` | Upload classroom CSV |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/dashboard/overview` | Full dashboard with risk classifications |
| GET | `/api/analytics/student/{id}` | Individual student breakdown |
| GET | `/api/analytics/concepts/{classroom_id}` | Concept mastery by classroom |

### AI Features
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/recommendations/{student_id}` | Get AI intervention suggestions |
| POST | `/api/quiz/generate` | Generate quiz by topic and difficulty |

---

## Key Design Decisions

**Rule-based risk signals over AI classification** — Risk classification is deterministic by design. Teachers need to explain a student's risk status to parents and administrators. An AI-generated risk score would be a black box. The 3-signal system is auditable, explainable, and adjustable per teacher.

**JSONB column for teacher preferences** — Instead of adding a new database column per setting (requiring a migration each time), all preferences are stored as a JSON dictionary in one JSONB column. The schema stays stable as new settings are added, and analytics functions read from this dictionary at runtime.

**React Context over Redux** — Global state in EdVisr is focused — just the teacher profile and active classes. Context API handles this cleanly in one file. Redux would have added actions, reducers, and a separate store file for no real benefit at this scale.

**JWT over session-based auth** — The backend is stateless — no session state stored server-side. The token carries teacher identity cryptographically, scales cleanly with REST, and fits the decoupled frontend/backend architecture.

**On-demand analytics** — Risk signals are computed per request using optimized SQL joins, ensuring data is always fresh. At scale, this would be replaced with precomputed analytics triggered on CSV ingestion via a background job queue (Celery + Redis).

**Stateless AI features** — Intervention suggestions and quiz generation are stateless — no conversation history stored between sessions. These features don't require memory, so storing history would only add API costs and database bloat.

**Upsert on student name** — During CSV ingestion, students are matched by name to prevent duplicates. Known limitation: names are not guaranteed unique. The correct long-term fix is requiring a roll number or student ID column as the primary matching key.