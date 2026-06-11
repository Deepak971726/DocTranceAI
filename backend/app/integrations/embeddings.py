"""Free local Ollama embedding provider."""

from __future__ import annotations

from typing import Protocol

import httpx

from app.core.config import Settings
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
)
from app.exceptions import AIServiceError

logger = get_logger(__name__)


class EmbeddingService(Protocol):
    """Provider-neutral embedding interface."""

    @property
    def dimensions(self) -> int:
        """Return vector dimensions."""
        ...

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of document chunks."""
        ...

    async def embed_query(self, text: str) -> list[float]:
        """Embed one retrieval query."""
        ...


class OllamaEmbeddingProvider:
    """Ollama `/api/embed` adapter supporting batched input."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = client

    @property
    def dimensions(self) -> int:
        """Return configured vector dimensions."""
        return self.settings.embedding_dimensions

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate normalized document vectors through Ollama."""
        return await self._embed(texts, process="Generate document embeddings")

    async def embed_query(self, text: str) -> list[float]:
        """Generate one normalized question vector through Ollama."""
        vectors = await self._embed([text], process="Generate question embedding")
        return vectors[0]

    async def _embed(self, texts: list[str], *, process: str) -> list[list[float]]:
        """Generate and validate one embedding batch."""
        if not texts:
            return []
        log_process_started(
            logger,
            process,
            count=len(texts),
            model=self.settings.embedding_model,
        )
        try:
            async with self._client or httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url.rstrip('/')}/api/embed",
                    json={
                        "model": self.settings.embedding_model,
                        "input": texts,
                        "truncate": True,
                        "dimensions": self.dimensions,
                    },
                )
                response.raise_for_status()
                payload = response.json()
            vectors = payload.get("embeddings", [])
            if len(vectors) != len(texts) or any(
                len(vector) != self.dimensions for vector in vectors
            ):
                raise AIServiceError(
                    "Embedding provider returned an unexpected vector shape.",
                    details={"expected_dimensions": self.dimensions},
                )
        except (httpx.HTTPError, ValueError, RuntimeError, AIServiceError) as exc:
            log_process_failed(
                logger,
                process,
                count=len(texts),
                model=self.settings.embedding_model,
            )
            if isinstance(exc, AIServiceError):
                raise
            raise AIServiceError("Embedding generation failed.") from exc
        log_process_finished(
            logger,
            process,
            count=len(vectors),
            dimensions=self.dimensions,
            model=self.settings.embedding_model,
        )
        return vectors


def build_embedding_service(settings: Settings) -> EmbeddingService:
    """Construct the free local embedding provider."""
    return OllamaEmbeddingProvider(settings)
