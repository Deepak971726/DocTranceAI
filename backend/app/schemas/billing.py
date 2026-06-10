"""Usage, subscription, and API key contracts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PlanName, SubscriptionStatus
from app.schemas.common import ORMModel


class UsageResponse(ORMModel):
    """Daily metered usage."""

    usage_date: date
    documents_uploaded: int
    questions_asked: int
    storage_bytes: int
    ai_requests: int
    embedding_tokens: int
    prompt_tokens: int
    completion_tokens: int


class SubscriptionResponse(ORMModel):
    """Current subscription and effective limits."""

    plan_name: PlanName
    status: SubscriptionStatus
    usage_limits: dict[str, Any]
    current_period_end: datetime | None
    cancel_at_period_end: bool


class APIKeyCreateRequest(BaseModel):
    """Create a named personal API key."""

    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["documents:read", "chat:write"])
    expires_at: datetime | None = None


class APIKeyResponse(ORMModel):
    """API key metadata without secret material."""

    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class APIKeyCreatedResponse(APIKeyResponse):
    """New API key response; plaintext is returned only once."""

    key: str
