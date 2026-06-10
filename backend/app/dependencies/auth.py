"""Authentication and tenant context dependencies."""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import user_id_context
from app.core.security import decode_token
from app.db.session import get_db_session
from app.db.tenancy import set_tenant_context
from app.exceptions import AuthenticationError
from app.models.entities import User
from app.repositories.users import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> User:
    """Validate an access JWT, establish RLS context, and load its user."""
    payload = decode_token(token, "access", settings)
    try:
        user_id = UUID(str(payload["sub"]))
    except ValueError as exc:
        raise AuthenticationError("Invalid token subject.") from exc
    await set_tenant_context(session, user_id)
    user = await UserRepository(session).get_by_id(user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User account is unavailable.")
    if payload.get("ver") != user.token_version:
        raise AuthenticationError("Token has been revoked.")
    user_id_context.set(str(user.id))
    return user


async def get_verified_user(user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user for document and AI operations."""
    return user
