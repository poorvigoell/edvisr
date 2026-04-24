from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Any

import jwt

from .config import settings
from .models import Teacher

ALGORITHM = "HS256"


def verify_sign_in_password(password: str) -> bool:
    return hmac.compare_digest(password, settings.auth_demo_password)


def hash_password(password: str) -> str:
    iterations = 390000
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, raw_iterations, salt, expected_digest = password_hash.split("$", maxsplit=3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(raw_iterations)
    except (ValueError, TypeError):
        return False

    calculated_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(calculated_digest, expected_digest)


def create_access_token(teacher: Teacher) -> str:
    now = datetime.now(tz=UTC)
    expires = now + timedelta(minutes=settings.auth_access_token_exp_minutes)
    payload: dict[str, Any] = {
        "sub": str(teacher.id),
        "email": teacher.email,
        "full_name": teacher.full_name,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm=ALGORITHM)


def verify_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError("Invalid access token.") from exc

    if not isinstance(payload, dict) or "sub" not in payload:
        raise ValueError("Invalid access token payload.")
    return payload


def extract_bearer_token(authorization_header: str | None) -> str | None:
    if not authorization_header:
        return None
    scheme, _, token = authorization_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token
