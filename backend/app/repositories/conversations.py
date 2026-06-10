"""Tenant-scoped conversations and messages."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Conversation, ConversationDocument, Message
from app.models.enums import MessageRole, MessageStatus


class ConversationRepository:
    """Conversation persistence with ownership filters on every operation."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: UUID, title: str, document_ids: list[UUID]) -> Conversation:
        """Create a conversation and bind selected tenant documents."""
        conversation = Conversation(user_id=user_id, title=title[:255])
        self.session.add(conversation)
        await self.session.flush()
        self.session.add_all(
            [
                ConversationDocument(
                    user_id=user_id,
                    conversation_id=conversation.id,
                    document_id=document_id,
                )
                for document_id in dict.fromkeys(document_ids)
            ]
        )
        await self.session.flush()
        return conversation

    async def get(self, user_id: UUID, conversation_id: UUID) -> Conversation | None:
        """Find one tenant conversation."""
        result = await self.session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
                Conversation.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def replace_documents(
        self, user_id: UUID, conversation_id: UUID, document_ids: list[UUID]
    ) -> None:
        """Update documents available to a conversation."""
        await self.session.execute(
            delete(ConversationDocument).where(
                ConversationDocument.user_id == user_id,
                ConversationDocument.conversation_id == conversation_id,
            )
        )
        self.session.add_all(
            [
                ConversationDocument(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    document_id=document_id,
                )
                for document_id in dict.fromkeys(document_ids)
            ]
        )
        await self.session.flush()

    async def list(
        self, user_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[Conversation], int]:
        """List tenant conversations."""
        filters = (Conversation.user_id == user_id, Conversation.deleted_at.is_(None))
        items = await self.session.execute(
            select(Conversation)
            .where(*filters)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        total = await self.session.execute(select(func.count(Conversation.id)).where(*filters))
        return list(items.scalars().all()), int(total.scalar_one())

    async def add_message(
        self,
        *,
        user_id: UUID,
        conversation_id: UUID,
        role: MessageRole,
        content: str,
        status: MessageStatus = MessageStatus.COMPLETED,
    ) -> Message:
        """Persist one message."""
        message = Message(
            user_id=user_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            status=status,
        )
        self.session.add(message)
        await self.session.flush()
        return message

    async def list_messages(
        self, user_id: UUID, conversation_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[Message], int]:
        """List non-deleted messages only after tenant ownership is established."""
        conversation = await self.get(user_id, conversation_id)
        if conversation is None:
            return [], 0
        filters = (
            Message.user_id == user_id,
            Message.conversation_id == conversation_id,
            Message.deleted_at.is_(None),
        )
        items = await self.session.execute(
            select(Message).where(*filters).order_by(Message.created_at).limit(limit).offset(offset)
        )
        total = await self.session.execute(select(func.count(Message.id)).where(*filters))
        return list(items.scalars().all()), int(total.scalar_one())

    async def get_message(
        self, user_id: UUID, conversation_id: UUID, message_id: UUID
    ) -> Message | None:
        """Find one tenant-owned message."""
        result = await self.session.execute(
            select(Message).where(
                Message.id == message_id,
                Message.user_id == user_id,
                Message.conversation_id == conversation_id,
                Message.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def complete_message(
        self,
        message: Message,
        *,
        content: str,
        citations: list[dict[str, object]],
        model_name: str,
        latency_ms: int,
    ) -> None:
        """Finalize an assistant message."""
        message.content = content
        message.citations = citations
        message.model_name = model_name
        message.latency_ms = latency_ms
        message.status = MessageStatus.COMPLETED
        await self.session.flush()

    async def fail_message(self, message: Message, error: str) -> None:
        """Mark a generation as failed without exposing provider internals."""
        message.status = MessageStatus.FAILED
        message.error_message = error[:4000]
        await self.session.flush()

    async def soft_delete(self, conversation: Conversation) -> None:
        """Soft delete a conversation and its visible messages."""
        now = datetime.now(timezone.utc)
        conversation.deleted_at = now
        await self.session.execute(
            Message.__table__.update()
            .where(
                Message.user_id == conversation.user_id,
                Message.conversation_id == conversation.id,
            )
            .values(deleted_at=now)
        )
        await self.session.flush()
