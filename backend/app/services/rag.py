"""Grounded retrieval, citation construction, and answer generation."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.constants.prompts import RAG_SYSTEM_PROMPT, RAG_USER_PROMPT
from app.core.config import Settings
from app.core.logging import get_logger, log_process_finished, log_process_started
from app.integrations.embeddings import EmbeddingService
from app.integrations.ollama import OllamaChatService
from app.integrations.qdrant import QdrantVectorStore
from app.schemas.documents import Citation

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    """Formatted context and its ordered citations."""

    context: str
    citations: list[Citation]


class RAGService:
    """End-to-end retrieval with tenant and optional document filters."""

    def __init__(
        self,
        settings: Settings,
        embeddings: EmbeddingService,
        vector_store: QdrantVectorStore,
        llm: OllamaChatService,
    ) -> None:
        self.settings = settings
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.llm = llm

    async def retrieve(
        self,
        *,
        user_id: UUID,
        query: str,
        document_ids: list[UUID] | None,
        top_k: int | None = None,
    ) -> RetrievalResult:
        """Embed a question and return grounded source chunks."""
        log_process_started(
            logger,
            "Retrieve relevant chunks",
            user_id=str(user_id),
            selected_documents=len(document_ids or []),
            top_k=top_k or self.settings.rag_top_k,
        )
        logger.info(
            "rag_retrieval_started — embedding query and searching Qdrant",
            user_id=str(user_id),
            query_preview=query[:120],
            document_ids=[str(d) for d in document_ids] if document_ids else "all",
            top_k=top_k or self.settings.rag_top_k,
        )
        query_vector = await self.embeddings.embed_query(query)
        hits = await self.vector_store.search(
            user_id=user_id,
            query_vector=query_vector,
            document_ids=document_ids,
            top_k=top_k or self.settings.rag_top_k,
            score_threshold=self.settings.rag_score_threshold,
        )
        log_process_started(
            logger,
            "Build grounded context",
            user_id=str(user_id),
            hits=len(hits),
        )
        citations: list[Citation] = []
        context_blocks: list[str] = []
        for index, hit in enumerate(hits, start=1):
            payload = hit.payload
            reference = f"C{index}"
            text = str(payload.get("chunk_text", ""))
            citation = Citation(
                reference=reference,
                document_id=UUID(str(payload["document_id"])),
                document_name=str(payload.get("filename", "Unknown document")),
                page_number=(
                    int(payload["page_number"]) if payload.get("page_number") is not None else None
                ),
                chunk_id=UUID(str(payload["chunk_id"])),
                chunk_index=int(payload.get("chunk_index", 0)),
                score=hit.score,
                excerpt=text[:500],
            )
            citations.append(citation)
            page = citation.page_number if citation.page_number is not None else "N/A"
            context_blocks.append(
                f"[{reference}] Document: {citation.document_name}; "
                f"Page: {page}; Chunk: {citation.chunk_index}\n{text}"
            )
        logger.info(
            "rag_retrieval_completed — context built, ready for generation",
            user_id=str(user_id),
            hits=len(hits),
            citations=len(citations),
            context_chars=sum(len(b) for b in context_blocks),
        )
        context = "\n\n".join(context_blocks)
        log_process_finished(
            logger,
            "Build grounded context",
            user_id=str(user_id),
            citations=len(citations),
            context_chars=len(context),
        )
        log_process_finished(
            logger,
            "Retrieve relevant chunks",
            user_id=str(user_id),
            hits=len(hits),
            citations=len(citations),
        )
        return RetrievalResult(context=context, citations=citations)

    async def answer(self, *, question: str, retrieval: RetrievalResult) -> str:
        """Generate an answer constrained by retrieved context."""
        log_process_started(
            logger,
            "Generate grounded answer",
            citations=len(retrieval.citations),
        )
        if not retrieval.citations:
            logger.info("rag_answer_skipped — no citations found, returning fallback message")
            answer = "I could not find enough information in the selected documents."
            log_process_finished(
                logger,
                "Generate grounded answer",
                citations=0,
                answer_chars=len(answer),
            )
            return answer
        logger.info(
            "rag_answer_started — sending context to LLM for grounded answer",
            citations=len(retrieval.citations),
        )
        result = await self.llm.generate(
            RAG_SYSTEM_PROMPT,
            RAG_USER_PROMPT.format(question=question, context=retrieval.context),
        )
        logger.info("rag_answer_done", answer_chars=len(result))
        log_process_finished(
            logger,
            "Generate grounded answer",
            citations=len(retrieval.citations),
            answer_chars=len(result),
        )
        return result
