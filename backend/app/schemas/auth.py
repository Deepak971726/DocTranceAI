"""Authentication request and response contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel


class RegisterRequest(BaseModel):
    """New user registration payload."""

    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Enforce entropy rules and bcrypt's byte-length boundary."""
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        checks = (
            any(char.islower() for char in value),
            any(char.isupper() for char in value),
            any(char.isdigit() for char in value),
            any(not char.isalnum() for char in value),
        )
        if sum(checks) < 3:
            raise ValueError(
                "Password must include at least three of: lowercase, uppercase, number, symbol"
            )
        return value


class LoginRequest(BaseModel):
    """Email and password login payload."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    """Refresh token rotation payload."""

    refresh_token: str = Field(min_length=32)


class LogoutRequest(BaseModel):
    """Refresh token revocation payload."""

    refresh_token: str = Field(min_length=32)


class ForgotPasswordRequest(BaseModel):
    """Password-reset request payload."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Single-use password-reset payload."""

    token: str = Field(min_length=32)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Apply registration password rules to password resets."""
        return RegisterRequest.validate_password_strength(value)


class UserResponse(ORMModel):
    """Safe user representation."""

    id: UUID
    email: EmailStr
    full_name: str | None
    is_active: bool
    is_verified: bool
    created_at: datetime


class TokenResponse(BaseModel):
    """JWT token pair returned after authentication."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
