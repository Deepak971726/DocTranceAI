"""Usage, subscription, API key, and audit persistence."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import APIKey, AuditLog, Subscription, UsageTracking


class UsageRepository:
    """Atomic PostgreSQL usage counters without an external cache."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def increment(
        self,
        user_id: UUID,
        *,
        documents_uploaded: int = 0,
        questions_asked: int = 0,
        storage_bytes: int = 0,
        ai_requests: int = 0,
        embedding_tokens: int = 0,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> None:
        """Upsert today's usage with concurrency-safe increments."""
        values = {
            "user_id": user_id,
            "usage_date": date.today(),
            "documents_uploaded": documents_uploaded,
            "questions_asked": questions_asked,
            "storage_bytes": storage_bytes,
            "ai_requests": ai_requests,
            "embedding_tokens": embedding_tokens,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        }
        statement = insert(UsageTracking).values(**values)
        excluded = statement.excluded
        statement = statement.on_conflict_do_update(
            constraint="uq_usage_user_date",
            set_={
                "documents_uploaded": UsageTracking.documents_uploaded
                + excluded.documents_uploaded,
                "questions_asked": UsageTracking.questions_asked + excluded.questions_asked,
                "storage_bytes": func.greatest(
                    0, UsageTracking.storage_bytes + excluded.storage_bytes
                ),
                "ai_requests": UsageTracking.ai_requests + excluded.ai_requests,
                "embedding_tokens": UsageTracking.embedding_tokens + excluded.embedding_tokens,
                "prompt_tokens": UsageTracking.prompt_tokens + excluded.prompt_tokens,
                "completion_tokens": UsageTracking.completion_tokens + excluded.completion_tokens,
                "updated_at": func.now(),
            },
        )
        await self.session.execute(statement)

    async def list(self, user_id: UUID, limit: int = 31) -> list[UsageTracking]:
        """Return recent tenant usage."""
        result = await self.session.execute(
            select(UsageTracking)
            .where(UsageTracking.user_id == user_id)
            .order_by(UsageTracking.usage_date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_subscription(
        self, user_id: UUID, *, for_update: bool = False
    ) -> Subscription | None:
        """Return the tenant's current subscription."""
        statement = select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.deleted_at.is_(None),
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()


class APIKeyRepository:
    """Tenant API key management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, **values: Any) -> APIKey:
        """Persist a key digest."""
        api_key = APIKey(**values)
        self.session.add(api_key)
        await self.session.flush()
        return api_key

    async def list(self, user_id: UUID) -> list[APIKey]:
        """List tenant API keys."""
        result = await self.session.execute(
            select(APIKey)
            .where(APIKey.user_id == user_id, APIKey.deleted_at.is_(None))
            .order_by(APIKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def get(self, user_id: UUID, key_id: UUID) -> APIKey | None:
        """Find a tenant API key."""
        result = await self.session.execute(
            select(APIKey).where(
                APIKey.id == key_id,
                APIKey.user_id == user_id,
                APIKey.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def revoke(self, api_key: APIKey) -> None:
        """Revoke a key immediately."""
        api_key.revoked_at = datetime.now(timezone.utc)
        await self.session.flush()


class AuditRepository:
    """Append-only audit event writer."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(self, **values: Any) -> None:
        """Persist an audit event in the current transaction."""
        self.session.add(AuditLog(**values))
        await self.session.flush()
