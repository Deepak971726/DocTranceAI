"""Authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status

from app.dependencies.services import get_auth_service
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.schemas.common import MessageResponse
from app.services.auth import AuthService

router = APIRouter()


def _client_metadata(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    return ip, request.headers.get("user-agent")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    """Create an active account."""
    ip, user_agent = _client_metadata(request)
    user = await service.register(
        email=str(payload.email),
        password=payload.password,
        full_name=payload.full_name,
        ip_address=ip,
        user_agent=user_agent,
    )
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Authenticate a user and return access/refresh JWTs."""
    ip, user_agent = _client_metadata(request)
    return await service.login(
        email=str(payload.email),
        password=payload.password,
        ip_address=ip,
        user_agent=user_agent,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Rotate a refresh token."""
    ip, user_agent = _client_metadata(request)
    return await service.refresh(
        refresh_token=payload.refresh_token,
        ip_address=ip,
        user_agent=user_agent,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    """Revoke a refresh token."""
    await service.logout(payload.refresh_token)
    return MessageResponse(message="Logged out.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    """Request a password reset without account enumeration."""
    ip, user_agent = _client_metadata(request)
    await service.request_password_reset(
        email=str(payload.email), ip_address=ip, user_agent=user_agent
    )
    return MessageResponse(message="If that account exists, a password reset email has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    """Reset a password and revoke all active sessions."""
    await service.reset_password(raw_token=payload.token, password=payload.password)
    return MessageResponse(message="Password reset completed.")
