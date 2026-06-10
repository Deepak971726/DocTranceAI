"""User and authentication token persistence."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuthToken, Subscription, User
from app.models.enums import AuthTokenType, PlanName, SubscriptionStatus


@dataclass(frozen=True, slots=True)
class AuthIdentity:
    """Minimal privileged identity record used before tenant context is known."""

    id: UUID
    password_hash: str
    token_version: int
    is_active: bool
    is_verified: bool


class UserRepository:
    """User persistence with normalized email lookups."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_email(self, email: str) -> User | None:
        """Find an active user by normalized email within existing tenant context."""
        result = await self.session.execute(
            select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def get_auth_identity(self, email: str) -> AuthIdentity | None:
        """Use a private security-definer function for login bootstrap."""
        result = await self.session.execute(
            text("SELECT * FROM private.get_user_for_auth(:email)"),
            {"email": email.lower()},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        return AuthIdentity(
            id=UUID(str(row["id"])),
            password_hash=str(row["password_hash"]),
            token_version=int(row["token_version"]),
            is_active=bool(row["is_active"]),
            is_verified=bool(row["is_verified"]),
        )

    async def get_by_id(self, user_id: UUID) -> User | None:
        """Find an active user by primary key."""
        result = await self.session.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        email: str,
        password_hash: str,
        full_name: str | None,
    ) -> User:
        """Create a user and default free subscription."""
        user = User(
            id=user_id,
            email=email.lower(),
            password_hash=password_hash,
            full_name=full_name.strip() if full_name else None,
            is_verified=True,
            email_verified_at=datetime.now(timezone.utc),
        )
        self.session.add(user)
        await self.session.flush()
        self.session.add(
            Subscription(
                user_id=user.id,
                plan_name=PlanName.FREE,
                status=SubscriptionStatus.ACTIVE,
                usage_limits={
                    "documents": 5,
                    "storage_bytes": 104857600,
                    "questions_per_month": 100,
                },
            )
        )
        await self.session.flush()
        return user

    async def mark_login(self, user: User) -> None:
        """Record a successful login."""
        user.last_login_at = datetime.now(timezone.utc)
        await self.session.flush()

    async def mark_verified(self, user: User) -> None:
        """Verify a user's email."""
        user.is_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        await self.session.flush()

    async def update_password(self, user: User, password_hash: str) -> None:
        """Replace password and invalidate all previously issued JWTs."""
        user.password_hash = password_hash
        user.token_version += 1
        await self.session.flush()


class AuthTokenRepository:
    """Hashed authentication token storage and rotation."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        token_type: AuthTokenType,
        expires_at: datetime,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> AuthToken:
        """Persist a token digest."""
        token = AuthToken(
            user_id=user_id,
            token_hash=token_hash,
            token_type=token_type,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_valid(self, token_hash: str, token_type: AuthTokenType) -> AuthToken | None:
        """Get an unexpired, unused, unrevoked token."""
        result = await self.session.execute(
            select(AuthToken).where(
                AuthToken.token_hash == token_hash,
                AuthToken.token_type == token_type,
                AuthToken.expires_at > datetime.now(timezone.utc),
                AuthToken.used_at.is_(None),
                AuthToken.revoked_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def consume(self, token: AuthToken) -> None:
        """Atomically mark a single-use or rotated token as consumed."""
        token.used_at = datetime.now(timezone.utc)
        await self.session.flush()

    async def revoke_by_hash(self, token_hash: str) -> bool:
        """Revoke one refresh token."""
        result = await self.session.execute(
            update(AuthToken)
            .where(
                AuthToken.token_hash == token_hash,
                AuthToken.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
        return bool(result.rowcount)

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        """Revoke every active token after a credential reset."""
        await self.session.execute(
            update(AuthToken)
            .where(AuthToken.user_id == user_id, AuthToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
