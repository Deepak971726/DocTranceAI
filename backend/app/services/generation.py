"""Whole-document summaries and FAQ generation."""

from __future__ import annotations

import json
import re
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.prompts import FAQ_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT
from app.core.logging import get_logger, log_process_finished, log_process_started
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
        log_process_started(
            logger,
            "Generate document summary",
            user_id=str(user_id),
            document_id=str(document_id),
        )
        document, chunks = await self._ready_document_chunks(user_id, document_id)
        batches = self._context_batches(chunks, max_chars=12000)
        logger.info(
            "summary_generation_started - sending document to LLM in batches",
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
                    num_predict=320,
                )
            )
        if len(partials) == 1:
            content = partials[0]
        else:
            logger.info(
                "summary_merging_partials - combining batch summaries into one",
                document_id=str(document_id),
                partial_count=len(partials),
            )
            content = await self.llm.generate(
                SUMMARY_SYSTEM_PROMPT,
                "Combine these grounded partial summaries without adding facts:\n\n"
                + "\n\n---\n\n".join(partials),
                num_predict=320,
            )
        log_process_started(
            logger,
            "Attach summary citations",
            document_id=str(document_id),
        )
        citations = self._citations(document.id, document.filename, chunks)
        log_process_finished(
            logger,
            "Attach summary citations",
            document_id=str(document_id),
            citations=len(citations),
        )
        await self.usage.increment(user_id, ai_requests=len(batches) + (len(partials) > 1))
        await self.session.commit()
        logger.info(
            "summary_generation_completed",
            document_id=str(document_id),
            user_id=str(user_id),
            citation_count=len(citations),
        )
        log_process_finished(
            logger,
            "Generate document summary",
            user_id=str(user_id),
            document_id=str(document_id),
            citations=len(citations),
            content_chars=len(content),
        )
        return SummaryResponse(document_id=document.id, content=content, citations=citations)

    async def faqs(self, user_id: UUID, document_id: UUID) -> FAQResponse:
        """Generate exactly twenty grounded FAQs."""
        log_process_started(
            logger,
            "Generate document FAQs",
            user_id=str(user_id),
            document_id=str(document_id),
            target=20,
        )
        document, chunks = await self._ready_document_chunks(user_id, document_id)
        sampled = self._sample_chunks(chunks, 40)
        context = self._format_context(sampled)
        logger.info(
            "faq_generation_started - sending sampled chunks to LLM",
            document_id=str(document_id),
            user_id=str(user_id),
            total_chunks=len(chunks),
            sampled_chunks=len(sampled),
        )
        faqs: list[FAQItem] = []
        seen_questions: set[str] = set()
        attempts = 1
        log_process_started(
            logger,
            "Generate FAQ batch",
            document_id=str(document_id),
            attempt=attempts,
            requested=20,
        )
        try:
            raw = await self.llm.generate(
                FAQ_SYSTEM_PROMPT,
                f"Document: {document.filename}\n\n"
                f"Generate exactly 20 new FAQs.\n\nContext:\n{context}",
                num_predict=700,
                json_mode=True,
            )
            payload = self._parse_json_object(raw)
            batch = self._parse_faq_items(payload)
        except AIServiceError:
            batch = []
            logger.warning(
                "faq_model_output_unusable",
                document_id=str(document_id),
                fallback="grounded_chunks",
            )
        for faq in batch:
            faq = self._ground_faq(faq, chunks)
            normalized = " ".join(faq.question.lower().split())
            if not normalized or normalized in seen_questions:
                continue
            seen_questions.add(normalized)
            faqs.append(faq)
            if len(faqs) == 20:
                break
        log_process_finished(
            logger,
            "Generate FAQ batch",
            document_id=str(document_id),
            attempt=attempts,
            received=len(batch),
            collected=len(faqs),
        )
        if len(faqs) < 20:
            log_process_started(
                logger,
                "Build grounded FAQ fallback",
                document_id=str(document_id),
                missing=20 - len(faqs),
            )
            faqs.extend(self._fallback_faqs(chunks, seen_questions, target=20 - len(faqs)))
            log_process_finished(
                logger,
                "Build grounded FAQ fallback",
                document_id=str(document_id),
                total=len(faqs),
            )
        faqs = faqs[:20]
        if len(faqs) != 20:
            raise AIServiceError("Unable to build exactly 20 grounded FAQs.")
        await self.usage.increment(user_id, ai_requests=attempts)
        await self.session.commit()
        logger.info(
            "faq_generation_completed",
            document_id=str(document_id),
            user_id=str(user_id),
            faq_count=len(faqs),
        )
        log_process_finished(
            logger,
            "Generate document FAQs",
            user_id=str(user_id),
            document_id=str(document_id),
            faq_count=len(faqs),
            attempts=attempts,
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

    @staticmethod
    def _parse_faq_items(payload: dict[str, object]) -> list[FAQItem]:
        """Normalize minor local-model JSON variations without accepting empty FAQs."""
        raw_items = payload.get("faqs") or payload.get("faq") or payload.get("questions")
        if not isinstance(raw_items, list):
            return []
        items: list[FAQItem] = []
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            question = str(raw_item.get("question") or raw_item.get("q") or "").strip()
            answer = str(raw_item.get("answer") or raw_item.get("a") or "").strip()
            if not question or not answer:
                continue
            raw_citations = (
                raw_item.get("citations")
                or raw_item.get("citation")
                or raw_item.get("references")
                or []
            )
            if isinstance(raw_citations, str):
                citations = re.findall(r"C\d+", raw_citations, flags=re.IGNORECASE)
            elif isinstance(raw_citations, list):
                citations = []
                for value in raw_citations:
                    cleaned = str(value).strip("[] ")
                    if not cleaned:
                        continue
                    citations.append(f"C{cleaned}" if cleaned.isdigit() else cleaned)
            else:
                citations = []
            if not citations:
                citations = re.findall(r"C\d+", answer, flags=re.IGNORECASE)
            items.append(
                FAQItem(
                    question=question,
                    answer=answer,
                    citations=list(dict.fromkeys(citations)),
                )
            )
        return items

    @staticmethod
    def _fallback_faqs(
        chunks: list[DocumentChunk],
        seen_questions: set[str],
        *,
        target: int,
    ) -> list[FAQItem]:
        """Fill missing FAQs with concise, cited questions derived from source chunks."""
        templates = (
            "What information is provided in {reference}?",
            "What key detail appears in {reference}?",
            "How can {reference} be summarized?",
            "Which fact is supported by {reference}?",
            "What does {reference} explain?",
            "What can be learned from {reference}?",
            "Which point is documented in {reference}?",
            "What evidence appears in {reference}?",
            "What is stated in {reference}?",
            "What should readers know from {reference}?",
        )
        items: list[FAQItem] = []
        for template in templates:
            for chunk in chunks:
                reference = f"C{chunk.chunk_index + 1}"
                question = template.format(reference=reference)
                normalized = " ".join(question.lower().split())
                if normalized in seen_questions:
                    continue
                text = " ".join(chunk.chunk_text.split())
                sentence = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0][:180].rstrip()
                if not sentence:
                    continue
                seen_questions.add(normalized)
                items.append(
                    FAQItem(
                        question=question,
                        answer=f"{sentence} [{reference}]",
                        citations=[reference],
                    )
                )
                if len(items) == target:
                    return items
        return items

    @staticmethod
    def _ground_faq(faq: FAQItem, chunks: list[DocumentChunk]) -> FAQItem:
        """Validate or repair FAQ citations using source-chunk keyword overlap."""
        valid_references = {f"C{chunk.chunk_index + 1}" for chunk in chunks}
        citations = [
            citation.upper()
            for citation in faq.citations
            if citation.upper() in valid_references
        ]
        if not citations:
            query_tokens = set(
                re.findall(r"[a-z0-9]{3,}", f"{faq.question} {faq.answer}".lower())
            )
            best_chunk = max(
                chunks,
                key=lambda chunk: len(
                    query_tokens
                    & set(re.findall(r"[a-z0-9]{3,}", chunk.chunk_text.lower()))
                ),
            )
            citations = [f"C{best_chunk.chunk_index + 1}"]
        answer = faq.answer
        if not re.search(r"\[C\d+\]", answer, flags=re.IGNORECASE):
            answer = f"{answer.rstrip()} [{citations[0]}]"
        return FAQItem(
            question=faq.question,
            answer=answer,
            citations=list(dict.fromkeys(citations)),
        )
