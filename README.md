# EdVisr AI: Actionable Class Intelligence

EdVisr is a modern, AI-powered analytics platform for educators that transforms classroom data into predictive insights. It helps identify student risk signals and concept gaps before they impact outcomes.

## 🚀 Key Features

- **LPU-Powered Analytics**: Real-time analysis of student performance using Groq (Llama 3.3).
- **1-Click Remedial Quizzes**: Instantly generate targeted practice quizzes for weak concepts.
- **AI Intervention Strategies**: Get actionable, data-driven recommendations for at-risk students.
- **Early Warning System**: Automatic detection of declining trends and critical performance drops.
- **Unified Workspace**: Manage classes, assignments, and AI-generated resources in one place.

## 🛠️ Technology Stack

### Frontend
- **Framework**: React + Vite
- **Styling**: Vanilla CSS (Premium Modern Aesthetic)
- **Charts**: Recharts
- **Icons**: Lucide (via PageHeader)

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (Current) / **PostgreSQL Recommended**
- **ORM**: SQLAlchemy 2.0
- **AI Engine**: Groq (LPU) + OpenAI SDK

## 📦 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Groq API Key

### Backend Setup
1. `cd Edvisr-backend`
2. `pip install -r requirements.txt`
3. Create `.env` with `GROQ_API_KEY`
4. `uvicorn main:app --reload`

### Frontend Setup
1. `cd edvisr-frontend`
2. `npm install`
3. `npm run dev`

## 📊 Database Recommendation

We strongly recommend migrating to **PostgreSQL** for production environments. 
- **Why?** Excellent performance with relational data, robust JSONB support for unstructured payloads, and industry-standard reliability.
- **How?** Simply update the `DATABASE_URL` in `.env` to point to a PostgreSQL instance. The SQLAlchemy models are already compatible.

## 📜 License
MIT
