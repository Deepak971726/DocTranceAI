"""Conversation orchestration for non-streaming and streaming RAG answers."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.constants.prompts import RAG_SYSTEM_PROMPT, RAG_USER_PROMPT
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
    request_id_context,
)
from app.db.tenancy import set_tenant_context
from app.exceptions import NotFoundError, ValidationError
from app.models.enums import MessageRole, MessageStatus
from app.repositories.conversations import ConversationRepository
from app.repositories.documents import DocumentRepository
from app.repositories.usage import AuditRepository, UsageRepository
from app.schemas.chat import ChatResponse
from app.services.rag import RAGService, RetrievalResult

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class PreparedChat:
    """Persisted chat state and retrieved context ready for generation."""

    user_id: UUID
    conversation_id: UUID
    assistant_message_id: UUID
    question: str
    retrieval: RetrievalResult


class ChatService:
    """Persist messages around grounded answer generation."""

    def __init__(
        self,
        *,
        session: AsyncSession,
        session_factory: async_sessionmaker[AsyncSession],
        rag: RAGService,
    ) -> None:
        self.session = session
        self.session_factory = session_factory
        self.rag = rag
        self.conversations = ConversationRepository(session)
        self.documents = DocumentRepository(session)
        self.usage = UsageRepository(session)
        self.audit = AuditRepository(session)

    async def prepare(
        self,
        *,
        user_id: UUID,
        question: str,
        document_ids: list[UUID],
        conversation_id: UUID | None,
    ) -> PreparedChat:
        """Validate tenant documents and persist user/pending assistant messages."""
        log_process_started(
            logger,
            "Receive user question",
            user_id=str(user_id),
            selected_documents=len(document_ids),
            conversation_id=str(conversation_id) if conversation_id else None,
        )
        unique_document_ids = list(dict.fromkeys(document_ids))
        log_process_started(
            logger,
            "Validate selected documents",
            user_id=str(user_id),
            selected_documents=len(unique_document_ids),
        )
        documents = await self.documents.get_many_ready(user_id, unique_document_ids)
        if len(documents) != len(unique_document_ids):
            raise ValidationError(
                "Every selected document must exist, belong to you, and be READY."
            )
        log_process_finished(
            logger,
            "Validate selected documents",
            user_id=str(user_id),
            selected_documents=len(unique_document_ids),
        )
        log_process_started(
            logger,
            "Create or update conversation",
            user_id=str(user_id),
            existing=conversation_id is not None,
        )
        if conversation_id is None:
            conversation = await self.conversations.create(
                user_id,
                title=question.strip()[:80],
                document_ids=unique_document_ids,
            )
        else:
            conversation = await self.conversations.get(user_id, conversation_id)
            if conversation is None:
                raise NotFoundError("Conversation not found.")
            await self.conversations.replace_documents(
                user_id, conversation.id, unique_document_ids
            )
        log_process_finished(
            logger,
            "Create or update conversation",
            user_id=str(user_id),
            conversation_id=str(conversation.id),
        )
        log_process_started(
            logger,
            "Store user question",
            user_id=str(user_id),
            conversation_id=str(conversation.id),
        )
        await self.conversations.add_message(
            user_id=user_id,
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=question,
        )
        assistant_message = await self.conversations.add_message(
            user_id=user_id,
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content="",
            status=MessageStatus.PENDING,
        )
        await self.session.commit()
        log_process_finished(
            logger,
            "Store user question",
            user_id=str(user_id),
            conversation_id=str(conversation.id),
            assistant_message_id=str(assistant_message.id),
        )
        retrieval = await self.rag.retrieve(
            user_id=user_id,
            query=question,
            document_ids=unique_document_ids,
        )
        log_process_finished(
            logger,
            "Receive user question",
            user_id=str(user_id),
            conversation_id=str(conversation.id),
            citations=len(retrieval.citations),
        )
        return PreparedChat(
            user_id=user_id,
            conversation_id=conversation.id,
            assistant_message_id=assistant_message.id,
            question=question,
            retrieval=retrieval,
        )

    async def complete(self, prepared: PreparedChat) -> ChatResponse:
        """Generate and persist a complete non-streaming answer."""
        started = time.perf_counter()
        log_process_started(
            logger,
            "Complete chat response",
            conversation_id=str(prepared.conversation_id),
            message_id=str(prepared.assistant_message_id),
        )
        try:
            answer = await self.rag.answer(question=prepared.question, retrieval=prepared.retrieval)
            message = await self.conversations.get_message(
                prepared.user_id,
                prepared.conversation_id,
                prepared.assistant_message_id,
            )
            if message is None:
                raise NotFoundError("Pending assistant message not found.")
            log_process_started(
                logger,
                "Attach citations",
                conversation_id=str(prepared.conversation_id),
                citations=len(prepared.retrieval.citations),
            )
            citations = [item.model_dump(mode="json") for item in prepared.retrieval.citations]
            log_process_finished(
                logger,
                "Attach citations",
                conversation_id=str(prepared.conversation_id),
                citations=len(citations),
            )
            log_process_started(
                logger,
                "Store chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
            )
            await self.conversations.complete_message(
                message,
                content=answer,
                citations=citations,
                model_name=self.rag.llm.model_name,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            await self.usage.increment(prepared.user_id, questions_asked=1, ai_requests=1)
            await self.audit.record(
                user_id=prepared.user_id,
                action="chat.answer_generated",
                resource_type="conversation",
                resource_id=prepared.conversation_id,
                request_id=request_id_context.get(),
                event_metadata={
                    "message_id": str(prepared.assistant_message_id),
                    "citations": len(prepared.retrieval.citations),
                },
            )
            await self.session.commit()
            log_process_finished(
                logger,
                "Store chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
            )
            logger.info(
                "chat_answer_completed — LLM responded, message saved, usage incremented",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
                citations=len(prepared.retrieval.citations),
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            log_process_finished(
                logger,
                "Complete chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
                citations=len(citations),
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return ChatResponse(
                conversation_id=prepared.conversation_id,
                message_id=prepared.assistant_message_id,
                answer=answer,
                citations=prepared.retrieval.citations,
            )
        except Exception as exc:
            log_process_failed(
                logger,
                "Complete chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
            )
            await self.session.rollback()
            await set_tenant_context(self.session, prepared.user_id)
            conversations = ConversationRepository(self.session)
            message = await conversations.get_message(
                prepared.user_id,
                prepared.conversation_id,
                prepared.assistant_message_id,
            )
            if message is not None:
                await conversations.fail_message(message, type(exc).__name__)
                await self.session.commit()
            raise

    async def stream(self, prepared: PreparedChat) -> AsyncIterator[str]:
        """Stream SSE events and finalize the assistant message in a fresh session."""
        started = time.perf_counter()
        fragments: list[str] = []
        log_process_started(
            logger,
            "Attach citations",
            conversation_id=str(prepared.conversation_id),
            citations=len(prepared.retrieval.citations),
        )
        citations = [item.model_dump(mode="json") for item in prepared.retrieval.citations]
        log_process_finished(
            logger,
            "Attach citations",
            conversation_id=str(prepared.conversation_id),
            citations=len(citations),
        )
        log_process_started(
            logger,
            "Stream chat response",
            conversation_id=str(prepared.conversation_id),
            message_id=str(prepared.assistant_message_id),
        )
        yield self._sse(
            "metadata",
            {
                "conversation_id": str(prepared.conversation_id),
                "message_id": str(prepared.assistant_message_id),
                "citations": citations,
            },
        )
        try:
            if not prepared.retrieval.citations:
                fallback = "I could not find enough information in the selected documents."
                fragments.append(fallback)
                yield self._sse("token", {"content": fallback})
            else:
                prompt = RAG_USER_PROMPT.format(
                    question=prepared.question,
                    context=prepared.retrieval.context,
                )
                async for fragment in self.rag.llm.stream(RAG_SYSTEM_PROMPT, prompt):
                    fragments.append(fragment)
                    yield self._sse("token", {"content": fragment})
            answer = "".join(fragments).strip()
            log_process_started(
                logger,
                "Store chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
            )
            async with self.session_factory() as session:
                await set_tenant_context(session, prepared.user_id)
                conversations = ConversationRepository(session)
                message = await conversations.get_message(
                    prepared.user_id,
                    prepared.conversation_id,
                    prepared.assistant_message_id,
                )
                if message:
                    await conversations.complete_message(
                        message,
                        content=answer,
                        citations=citations,
                        model_name=self.rag.llm.model_name,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                    )
                    await UsageRepository(session).increment(
                        prepared.user_id, questions_asked=1, ai_requests=1
                    )
                    await AuditRepository(session).record(
                        user_id=prepared.user_id,
                        action="chat.answer_streamed",
                        resource_type="conversation",
                        resource_id=prepared.conversation_id,
                        event_metadata={
                            "message_id": str(prepared.assistant_message_id),
                            "citations": len(prepared.retrieval.citations),
                        },
                    )
                    await session.commit()
            log_process_finished(
                logger,
                "Store chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
                answer_chars=len(answer),
            )
            yield self._sse("done", {"message_id": str(prepared.assistant_message_id)})
            log_process_finished(
                logger,
                "Stream chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
                answer_chars=len(answer),
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
        except asyncio.CancelledError:
            log_process_failed(
                logger,
                "Stream chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
                reason="cancelled",
            )
            await self._fail_stream_message(prepared, "CancelledError")
            raise
        except Exception as exc:
            log_process_failed(
                logger,
                "Stream chat response",
                conversation_id=str(prepared.conversation_id),
                message_id=str(prepared.assistant_message_id),
            )
            logger.exception(
                "streaming_chat_failed — SSE stream aborted, message marked failed",
                message_id=str(prepared.assistant_message_id),
                conversation_id=str(prepared.conversation_id),
            )
            await self._fail_stream_message(prepared, type(exc).__name__)
            yield self._sse(
                "error",
                {"code": "generation_failed", "message": "Answer generation failed."},
            )

    async def _fail_stream_message(self, prepared: PreparedChat, error: str) -> None:
        """Finalize an interrupted stream so conversations never remain pending forever."""
        async with self.session_factory() as session:
            await set_tenant_context(session, prepared.user_id)
            conversations = ConversationRepository(session)
            message = await conversations.get_message(
                prepared.user_id,
                prepared.conversation_id,
                prepared.assistant_message_id,
            )
            if message:
                await conversations.fail_message(message, error)
                await session.commit()

    @staticmethod
    def _sse(event: str, payload: dict[str, object]) -> str:
        """Encode one Server-Sent Event."""
        return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
