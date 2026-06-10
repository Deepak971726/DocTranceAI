"""Password, JWT, opaque token, and API-key security helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import Settings
from app.exceptions import AuthenticationError

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt through Passlib."""
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verify a password against its stored hash."""
    return password_context.verify(password, password_hash)


def hash_token(token: str) -> str:
    """Create a deterministic SHA-256 digest for token storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_opaque_token() -> str:
    """Generate a high-entropy URL-safe single-use token."""
    return secrets.token_urlsafe(48)


def create_api_key() -> tuple[str, str, str]:
    """Return a plaintext API key, display prefix, and storage hash."""
    plaintext = f"dta_{secrets.token_urlsafe(36)}"
    return plaintext, plaintext[:12], hash_token(plaintext)


def _create_jwt(
    *,
    user_id: UUID,
    token_version: int,
    token_type: str,
    expires_delta: timedelta,
    settings: Settings,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": token_type,
        "ver": token_version,
        "jti": str(uuid4()),
        "iat": now,
        "nbf": now,
        "exp": now + expires_delta,
        "iss": settings.app_name,
        "aud": "doctraceai-api",
    }
    return jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def create_access_token(user_id: UUID, token_version: int, settings: Settings) -> str:
    """Create a short-lived access JWT."""
    return _create_jwt(
        user_id=user_id,
        token_version=token_version,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        settings=settings,
    )


def create_refresh_token(user_id: UUID, token_version: int, settings: Settings) -> str:
    """Create a rotating refresh JWT whose digest is persisted."""
    return _create_jwt(
        user_id=user_id,
        token_version=token_version,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        settings=settings,
    )


def decode_token(token: str, expected_type: str, settings: Settings) -> dict[str, Any]:
    """Decode and validate a JWT including issuer, audience, and purpose."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            audience="doctraceai-api",
            issuer=settings.app_name,
        )
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token.") from exc
    if payload.get("type") != expected_type or not payload.get("sub"):
        raise AuthenticationError("Invalid token type.")
    return payload
