"""Authentication, token rotation, and password reset workflows."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.logging import get_logger, request_id_context
from app.core.security import (
    create_access_token,
    create_opaque_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.tenancy import set_tenant_context
from app.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.integrations.email import EmailService
from app.models.entities import User
from app.models.enums import AuthTokenType
from app.repositories.usage import AuditRepository
from app.repositories.users import AuthTokenRepository, UserRepository
from app.schemas.auth import TokenResponse, UserResponse

logger = get_logger(__name__)


class AuthService:
    """Coordinate secure identity lifecycle operations."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        email_service: EmailService,
    ) -> None:
        self.session = session
        self.settings = settings
        self.email_service = email_service
        self.users = UserRepository(session)
        self.tokens = AuthTokenRepository(session)
        self.audit = AuditRepository(session)

    async def register(
        self,
        *,
        email: str,
        password: str,
        full_name: str | None,
        ip_address: str | None,
        user_agent: str | None,
    ) -> User:
        """Create a tenant, default subscription, and immediately usable account."""
        user_id = uuid4()
        await set_tenant_context(self.session, user_id)
        try:
            user = await self.users.create(
                user_id=user_id,
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
            )
            await self.audit.record(
                user_id=user.id,
                action="auth.register",
                resource_type="user",
                resource_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_id=request_id_context.get(),
            )
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError("An account with this email already exists.") from exc

        logger.info(
            "user_registered",
            user_id=str(user.id),
            email=user.email,
        )
        return user

    async def login(
        self,
        *,
        email: str,
        password: str,
        ip_address: str | None,
        user_agent: str | None,
    ) -> TokenResponse:
        """Authenticate credentials and issue a rotating token pair."""
        identity = await self.users.get_auth_identity(email)
        if identity is None or not verify_password(password, identity.password_hash):
            raise AuthenticationError("Invalid email or password.")
        if not identity.is_active:
            raise AuthenticationError("This account is disabled.")
        await set_tenant_context(self.session, identity.id)
        user = await self.users.get_by_id(identity.id)
        if user is None:
            raise AuthenticationError("Invalid email or password.")
        await self.users.mark_login(user)
        response = await self._issue_token_pair(
            user=user, ip_address=ip_address, user_agent=user_agent
        )
        await self.audit.record(
            user_id=user.id,
            action="auth.login",
            resource_type="user",
            resource_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id_context.get(),
        )
        await self.session.commit()
        logger.info(
            "user_logged_in",
            user_id=str(user.id),
            ip_address=ip_address,
        )
        return response

    async def refresh(
        self,
        *,
        refresh_token: str,
        ip_address: str | None,
        user_agent: str | None,
    ) -> TokenResponse:
        """Rotate a refresh token and reject replayed tokens."""
        payload = decode_token(refresh_token, "refresh", self.settings)
        user_id = UUID(str(payload["sub"]))
        await set_tenant_context(self.session, user_id)
        stored = await self.tokens.get_valid(hash_token(refresh_token), AuthTokenType.REFRESH)
        if stored is None:
            raise AuthenticationError("Refresh token is invalid or has already been used.")
        user = await self.users.get_by_id(user_id)
        if user is None or not user.is_active or payload.get("ver") != user.token_version:
            raise AuthenticationError("Refresh token is no longer valid.")
        await self.tokens.consume(stored)
        response = await self._issue_token_pair(
            user=user, ip_address=ip_address, user_agent=user_agent
        )
        await self.session.commit()
        return response

    async def logout(self, refresh_token: str) -> None:
        """Revoke the presented refresh token."""
        try:
            payload = decode_token(refresh_token, "refresh", self.settings)
            await set_tenant_context(self.session, UUID(str(payload["sub"])))
            await self.tokens.revoke_by_hash(hash_token(refresh_token))
            await self.session.commit()
        except AuthenticationError:
            await self.session.rollback()
        logger.info("user_logged_out")

    async def request_password_reset(
        self,
        *,
        email: str,
        ip_address: str | None,
        user_agent: str | None,
    ) -> None:
        """Create a reset token without revealing whether the email exists."""
        identity = await self.users.get_auth_identity(email)
        if identity is None or not identity.is_active:
            logger.info("password_reset_requested_unknown_email")
            return
        await set_tenant_context(self.session, identity.id)
        user = await self.users.get_by_id(identity.id)
        if user is None:
            return
        token = await self._create_opaque_user_token(
            user=user,
            token_type=AuthTokenType.PASSWORD_RESET,
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=self.settings.password_reset_expire_minutes),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        reset_url = f"{self.settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        await self.email_service.send(
            recipient=user.email,
            subject="Reset your DocTraceAI password",
            body=f"Reset your password using this link:\n\n{reset_url}",
        )

    async def reset_password(self, *, raw_token: str, password: str) -> None:
        """Consume a reset token, change the password, and revoke all sessions."""
        user_id = self._user_id_from_opaque_token(raw_token)
        await set_tenant_context(self.session, user_id)
        token = await self.tokens.get_valid(hash_token(raw_token), AuthTokenType.PASSWORD_RESET)
        if token is None or token.user_id != user_id:
            raise AuthenticationError("Password reset token is invalid or expired.")
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User account was not found.")
        await self.tokens.consume(token)
        await self.users.update_password(user, hash_password(password))
        await self.tokens.revoke_all_for_user(user_id)
        await self.audit.record(
            user_id=user.id,
            action="auth.password_reset",
            resource_type="user",
            resource_id=user.id,
            request_id=request_id_context.get(),
        )
        await self.session.commit()
        logger.info(
            "password_reset_completed",
            user_id=str(user_id),
        )

    async def _issue_token_pair(
        self, *, user: User, ip_address: str | None, user_agent: str | None
    ) -> TokenResponse:
        access = create_access_token(user.id, user.token_version, self.settings)
        refresh = create_refresh_token(user.id, user.token_version, self.settings)
        await self.tokens.create(
            user_id=user.id,
            token_hash=hash_token(refresh),
            token_type=AuthTokenType.REFRESH,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=self.settings.refresh_token_expire_days),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return TokenResponse(
            access_token=access,
            refresh_token=refresh,
            expires_in=self.settings.access_token_expire_minutes * 60,
            user=UserResponse.model_validate(user),
        )

    async def _create_opaque_user_token(
        self,
        *,
        user: User,
        token_type: AuthTokenType,
        expires_at: datetime,
        ip_address: str | None,
        user_agent: str | None,
    ) -> str:
        raw_token = f"{user.id}.{create_opaque_token()}"
        await self.tokens.create(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            token_type=token_type,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return raw_token

    @staticmethod
    def _user_id_from_opaque_token(raw_token: str) -> UUID:
        try:
            return UUID(raw_token.split(".", maxsplit=1)[0])
        except (ValueError, IndexError) as exc:
            raise AuthenticationError("Token is invalid.") from exc
