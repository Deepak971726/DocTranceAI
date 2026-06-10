"""Conversation and RAG chat contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import MessageRole, MessageStatus
from app.schemas.common import ORMModel
from app.schemas.documents import Citation


class ChatRequest(BaseModel):
    """Question asked against one or more ready documents."""

    question: str = Field(min_length=2, max_length=10000)
    conversation_id: UUID | None = None
    document_ids: list[UUID] = Field(min_length=1, max_length=50)
    stream: bool = False


class MessageResponse(ORMModel):
    """Persisted chat message."""

    id: UUID
    conversation_id: UUID
    role: MessageRole
    status: MessageStatus
    content: str
    citations: list[dict[str, Any]]
    model_name: str | None
    created_at: datetime


class ConversationResponse(ORMModel):
    """Conversation list item."""

    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ChatResponse(BaseModel):
    """Non-streaming grounded answer."""

    conversation_id: UUID
    message_id: UUID
    answer: str
    citations: list[Citation]
