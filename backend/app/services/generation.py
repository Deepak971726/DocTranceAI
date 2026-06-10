"""Whole-document summaries and FAQ generation."""

from __future__ import annotations

import json
import re
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.prompts import FAQ_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT
from app.core.logging import get_logger
from app.exceptions import AIServiceError, NotFoundError, ValidationError
from app.integrations.ollama import OllamaChatService
from app.models.entities import DocumentChunk
from app.models.enums import DocumentStatus
from app.repositories.documents import DocumentRepository
from app.repositories.usage import UsageRepository
from app.schemas.documents import Citation, FAQItem, FAQResponse, SummaryResponse

logger = get_logger(__name__)


class DocumentGenerationService:
    """Generate grounded derived content from ordered relational chunks."""

    def __init__(self, session: AsyncSession, llm: OllamaChatService) -> None:
        self.session = session
        self.llm = llm
        self.documents = DocumentRepository(session)
        self.usage = UsageRepository(session)

    async def summary(self, user_id: UUID, document_id: UUID) -> SummaryResponse:
        """Generate a hierarchical summary for a ready tenant document."""
        document, chunks = await self._ready_document_chunks(user_id, document_id)
        batches = self._context_batches(chunks, max_chars=12000)
        logger.info(
            "summary_generation_started — sending document to LLM in batches",
            document_id=str(document_id),
            user_id=str(user_id),
            chunk_count=len(chunks),
            batch_count=len(batches),
        )
        partials: list[str] = []
        for index, context in enumerate(batches, start=1):
            logger.info(
                "summary_batch_processing",
                document_id=str(document_id),
                batch=index,
                of=len(batches),
            )
            partials.append(
                await self.llm.generate(
                    SUMMARY_SYSTEM_PROMPT,
                    f"Summarize this section of {document.filename}:\n\n{context}",
                )
            )
        if len(partials) == 1:
            content = partials[0]
        else:
            logger.info(
                "summary_merging_partials — combining batch summaries into one",
                document_id=str(document_id),
                partial_count=len(partials),
            )
            content = await self.llm.generate(
                SUMMARY_SYSTEM_PROMPT,
                "Combine these grounded partial summaries without adding facts:\n\n"
                + "\n\n---\n\n".join(partials),
            )
        citations = self._citations(document.id, document.filename, chunks)
        await self.usage.increment(user_id, ai_requests=len(batches) + (len(partials) > 1))
        await self.session.commit()
        logger.info(
            "summary_generation_completed",
            document_id=str(document_id),
            user_id=str(user_id),
            citation_count=len(citations),
        )
        return SummaryResponse(document_id=document.id, content=content, citations=citations)

    async def faqs(self, user_id: UUID, document_id: UUID) -> FAQResponse:
        """Generate exactly twenty grounded FAQs."""
        document, chunks = await self._ready_document_chunks(user_id, document_id)
        sampled = self._sample_chunks(chunks, 40)
        context = self._format_context(sampled)
        logger.info(
            "faq_generation_started — sending sampled chunks to LLM",
            document_id=str(document_id),
            user_id=str(user_id),
            total_chunks=len(chunks),
            sampled_chunks=len(sampled),
        )
        raw = await self.llm.generate(
            FAQ_SYSTEM_PROMPT,
            f"Document: {document.filename}\n\nContext:\n{context}",
        )
        payload = self._parse_json_object(raw)
        try:
            faqs = [FAQItem.model_validate(item) for item in payload["faqs"]]
        except (KeyError, TypeError, ValueError) as exc:
            raise AIServiceError("The AI service returned invalid FAQ data.") from exc
        if len(faqs) != 20:
            raise AIServiceError("The AI service did not return exactly 20 FAQs.")
        await self.usage.increment(user_id, ai_requests=1)
        await self.session.commit()
        logger.info(
            "faq_generation_completed",
            document_id=str(document_id),
            user_id=str(user_id),
            faq_count=len(faqs),
        )
        return FAQResponse(document_id=document.id, faqs=faqs)

    async def _ready_document_chunks(
        self, user_id: UUID, document_id: UUID
    ) -> tuple[object, list[DocumentChunk]]:
        document = await self.documents.get(user_id, document_id)
        if document is None:
            raise NotFoundError("Document not found.")
        if document.status != DocumentStatus.READY:
            raise ValidationError("Document must be READY before generation.")
        chunks = await self.documents.list_chunks(user_id, document_id)
        if not chunks:
            raise ValidationError("Document has no searchable content.")
        return document, chunks

    def _context_batches(self, chunks: list[DocumentChunk], max_chars: int) -> list[str]:
        batches: list[str] = []
        current: list[DocumentChunk] = []
        current_size = 0
        for chunk in chunks:
            if current and current_size + len(chunk.chunk_text) > max_chars:
                batches.append(self._format_context(current))
                current = []
                current_size = 0
            current.append(chunk)
            current_size += len(chunk.chunk_text)
        if current:
            batches.append(self._format_context(current))
        return batches

    @staticmethod
    def _format_context(chunks: list[DocumentChunk]) -> str:
        return "\n\n".join(
            f"[C{chunk.chunk_index + 1}] Page {chunk.page_number or 'N/A'}; "
            f"Chunk {chunk.chunk_index}\n{chunk.chunk_text}"
            for chunk in chunks
        )

    @staticmethod
    def _sample_chunks(chunks: list[DocumentChunk], limit: int) -> list[DocumentChunk]:
        if len(chunks) <= limit:
            return chunks
        step = (len(chunks) - 1) / (limit - 1)
        return [chunks[round(index * step)] for index in range(limit)]

    @staticmethod
    def _citations(document_id: UUID, filename: str, chunks: list[DocumentChunk]) -> list[Citation]:
        return [
            Citation(
                reference=f"C{chunk.chunk_index + 1}",
                document_id=document_id,
                document_name=filename,
                page_number=chunk.page_number,
                chunk_id=chunk.id,
                chunk_index=chunk.chunk_index,
                excerpt=chunk.chunk_text[:500],
            )
            for chunk in chunks[:100]
        ]

    @staticmethod
    def _parse_json_object(raw: str) -> dict[str, object]:
        cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.IGNORECASE).strip()
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise AIServiceError("The AI service returned non-JSON FAQ data.")
        try:
            payload = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIServiceError("The AI service returned malformed FAQ JSON.") from exc
        if not isinstance(payload, dict):
            raise AIServiceError("The AI service returned invalid FAQ data.")
        return payload
