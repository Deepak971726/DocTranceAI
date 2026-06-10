"""Subscription, usage, and API-key account workflows."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_context
from app.core.security import create_api_key
from app.exceptions import ConflictError, NotFoundError
from app.models.entities import APIKey, Subscription, UsageTracking
from app.repositories.usage import APIKeyRepository, AuditRepository, UsageRepository


class AccountService:
    """Read metering/subscription state and manage personal API keys."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.usage = UsageRepository(session)
        self.api_keys = APIKeyRepository(session)
        self.audit = AuditRepository(session)

    async def recent_usage(self, user_id: UUID) -> list[UsageTracking]:
        """Return recent daily usage."""
        return await self.usage.list(user_id)

    async def subscription(self, user_id: UUID) -> Subscription:
        """Return current tenant subscription."""
        subscription = await self.usage.get_subscription(user_id)
        if subscription is None:
            raise NotFoundError("Subscription not found.")
        return subscription

    async def create_api_key(
        self,
        *,
        user_id: UUID,
        name: str,
        scopes: list[str],
        expires_at: datetime | None,
    ) -> tuple[APIKey, str]:
        """Create a hashed API key and return its plaintext once."""
        if expires_at is not None and expires_at <= datetime.now(expires_at.tzinfo):
            raise ConflictError("API key expiration must be in the future.")
        plaintext, prefix, digest = create_api_key()
        api_key = await self.api_keys.create(
            user_id=user_id,
            name=name,
            key_prefix=prefix,
            key_hash=digest,
            scopes=list(dict.fromkeys(scopes)),
            expires_at=expires_at,
        )
        await self.audit.record(
            user_id=user_id,
            action="api_key.created",
            resource_type="api_key",
            resource_id=api_key.id,
            request_id=request_id_context.get(),
            event_metadata={"prefix": prefix, "scopes": scopes},
        )
        await self.session.commit()
        return api_key, plaintext

    async def list_api_keys(self, user_id: UUID) -> list[APIKey]:
        """List tenant key metadata."""
        return await self.api_keys.list(user_id)

    async def revoke_api_key(self, user_id: UUID, key_id: UUID) -> None:
        """Revoke a tenant API key."""
        api_key = await self.api_keys.get(user_id, key_id)
        if api_key is None:
            raise NotFoundError("API key not found.")
        await self.api_keys.revoke(api_key)
        await self.audit.record(
            user_id=user_id,
            action="api_key.revoked",
            resource_type="api_key",
            resource_id=api_key.id,
            request_id=request_id_context.get(),
        )
        await self.session.commit()
