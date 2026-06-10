"""RAG chat and conversation history endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.auth import get_verified_user
from app.dependencies.services import get_chat_service
from app.exceptions import NotFoundError
from app.models.entities import User
from app.repositories.conversations import ConversationRepository
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    MessageResponse,
)
from app.schemas.common import MessageResponse as OperationResponse
from app.schemas.common import Page
from app.services.chat import ChatService

router = APIRouter()


@router.post("/chat", response_model=None)
async def chat(
    payload: ChatRequest,
    user: User = Depends(get_verified_user),
    service: ChatService = Depends(get_chat_service),
) -> Response | ChatResponse:
    """Ask a grounded question, optionally using Server-Sent Events."""
    prepared = await service.prepare(
        user_id=user.id,
        question=payload.question,
        document_ids=payload.document_ids,
        conversation_id=payload.conversation_id,
    )
    if payload.stream:
        return StreamingResponse(
            service.stream(prepared),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )
    return await service.complete(prepared)


@router.get("/conversations", response_model=Page[ConversationResponse])
async def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_db_session),
) -> Page[ConversationResponse]:
    """List tenant conversations."""
    items, total = await ConversationRepository(session).list(user.id, limit=limit, offset=offset)
    return Page(
        items=[ConversationResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/messages", response_model=Page[MessageResponse])
async def list_messages(
    conversation_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_db_session),
) -> Page[MessageResponse]:
    """List messages in a tenant-owned conversation."""
    repository = ConversationRepository(session)
    conversation = await repository.get(user.id, conversation_id)
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    items, total = await repository.list_messages(
        user.id, conversation_id, limit=limit, offset=offset
    )
    return Page(
        items=[MessageResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete("/conversations/{conversation_id}", response_model=OperationResponse)
async def delete_conversation(
    conversation_id: UUID,
    user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_db_session),
) -> OperationResponse:
    """Soft-delete a tenant conversation and its messages."""
    repository = ConversationRepository(session)
    conversation = await repository.get(user.id, conversation_id)
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    await repository.soft_delete(conversation)
    await session.commit()
    return OperationResponse(message="Conversation deleted.")
