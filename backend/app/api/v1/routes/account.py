"""Usage, subscription, and API-key endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.dependencies.auth import get_current_user
from app.dependencies.services import get_account_service
from app.models.entities import User
from app.schemas.billing import (
    APIKeyCreatedResponse,
    APIKeyCreateRequest,
    APIKeyResponse,
    SubscriptionResponse,
    UsageResponse,
)
from app.schemas.common import MessageResponse
from app.services.account import AccountService

router = APIRouter()


@router.get("/usage", response_model=list[UsageResponse])
async def usage(
    user: User = Depends(get_current_user),
    service: AccountService = Depends(get_account_service),
) -> list[UsageResponse]:
    """Return recent daily usage."""
    rows = await service.recent_usage(user.id)
    return [UsageResponse.model_validate(row) for row in rows]


@router.get("/subscription", response_model=SubscriptionResponse)
async def subscription(
    user: User = Depends(get_current_user),
    service: AccountService = Depends(get_account_service),
) -> SubscriptionResponse:
    """Return the current plan and usage limits."""
    return SubscriptionResponse.model_validate(await service.subscription(user.id))


@router.post("/api-keys", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: APIKeyCreateRequest,
    user: User = Depends(get_current_user),
    service: AccountService = Depends(get_account_service),
) -> APIKeyCreatedResponse:
    """Create an API key whose plaintext is returned only in this response."""
    api_key, plaintext = await service.create_api_key(
        user_id=user.id,
        name=payload.name,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    return APIKeyCreatedResponse(
        **APIKeyResponse.model_validate(api_key).model_dump(),
        key=plaintext,
    )


@router.get("/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    service: AccountService = Depends(get_account_service),
) -> list[APIKeyResponse]:
    """List API key metadata."""
    return [APIKeyResponse.model_validate(item) for item in await service.list_api_keys(user.id)]


@router.delete("/api-keys/{key_id}", response_model=MessageResponse)
async def revoke_api_key(
    key_id: UUID,
    user: User = Depends(get_current_user),
    service: AccountService = Depends(get_account_service),
) -> MessageResponse:
    """Revoke an API key."""
    await service.revoke_api_key(user.id, key_id)
    return MessageResponse(message="API key revoked.")
