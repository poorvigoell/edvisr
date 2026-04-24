import os
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env file explicitly
load_dotenv()


def _parse_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    api_prefix: str
    database_url: str
    cors_origins: list[str]
    auth_jwt_secret: str
    auth_access_token_exp_minutes: int
    auth_demo_password: str
    demo_mode: bool
    underperform_threshold: float
    decline_threshold: float
    missing_submission_threshold: float
    weak_concept_accuracy_threshold: float
    weak_concept_score_threshold: float


def load_settings() -> Settings:
    cors_default = (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://edvisr.netlify.app"
    )
    return Settings(
        app_name=os.getenv("APP_NAME", "EdVisr API"),
        app_version=os.getenv("APP_VERSION", "1.0.0"),
        api_prefix=os.getenv("API_PREFIX", "/api"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./edvisr.db"),
        cors_origins=_parse_origins(os.getenv("CORS_ORIGINS", cors_default)),
        auth_jwt_secret=os.getenv("AUTH_JWT_SECRET", "change-me-in-production"),
        auth_access_token_exp_minutes=int(os.getenv("AUTH_ACCESS_TOKEN_EXP_MINUTES", "120")),
        auth_demo_password=os.getenv("AUTH_DEMO_PASSWORD", "edvisr123"),
        demo_mode=os.getenv("DEMO_MODE", "true").lower() == "true",
        underperform_threshold=float(os.getenv("UNDERPERFORM_THRESHOLD", "0.55")),
        decline_threshold=float(os.getenv("DECLINE_THRESHOLD", "0.12")),
        missing_submission_threshold=float(os.getenv("MISSING_SUBMISSION_THRESHOLD", "0.30")),
        weak_concept_accuracy_threshold=float(os.getenv("WEAK_CONCEPT_ACCURACY_THRESHOLD", "0.60")),
        weak_concept_score_threshold=float(os.getenv("WEAK_CONCEPT_SCORE_THRESHOLD", "60")),
    )


settings = load_settings()
