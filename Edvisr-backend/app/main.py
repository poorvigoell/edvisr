from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import router
from .auth import extract_bearer_token, verify_access_token
from .config import settings
from .database import Base, engine
from . import models  # noqa: F401

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="EdVisr classroom insight and early intervention API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    is_api_path = path.startswith(settings.api_prefix)
    is_public_api_path = path in {
        f"{settings.api_prefix}/auth/sign-in",
        f"{settings.api_prefix}/auth/sign-up",
        f"{settings.api_prefix}/health",
    }

    if request.method == "OPTIONS":
        return await call_next(request)

    if is_api_path and not is_public_api_path:
        token = extract_bearer_token(request.headers.get("Authorization"))
        if token is None:
            return JSONResponse(status_code=401, content={"detail": "Missing bearer token."})

        try:
            verify_access_token(token)
        except ValueError as exc:
            return JSONResponse(status_code=401, content={"detail": str(exc)})

    return await call_next(request)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)

@app.get("/")
def root() -> dict[str, str]:
    return {"message": "EdVisr API is running"}

app.include_router(router, prefix=settings.api_prefix)
