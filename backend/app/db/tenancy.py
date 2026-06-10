"""PostgreSQL tenant context used by row-level security policies."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import func


async def set_tenant_context(session: AsyncSession, user_id: UUID) -> None:
    """Set a transaction-local tenant identifier without string interpolation."""
    await session.execute(select(func.set_config("app.current_user_id", str(user_id), True)))


async def clear_tenant_context(session: AsyncSession) -> None:
    """Clear tenant context before privileged or unauthenticated operations."""
    await session.execute(select(func.set_config("app.current_user_id", "", True)))
