"""Free local Ollama embedding provider."""

from __future__ import annotations

from typing import Protocol

import httpx

from app.core.config import Settings
from app.core.logging import get_logger
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
        """Generate normalized vectors through Ollama."""
        if not texts:
            return []
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
        except (httpx.HTTPError, ValueError, RuntimeError) as exc:
            logger.exception(
                "ollama_embedding_failed — could not generate vectors for chunks",
                count=len(texts),
                model=self.settings.embedding_model,
            )
            raise AIServiceError("Embedding generation failed.") from exc
        vectors = payload.get("embeddings", [])
        if len(vectors) != len(texts) or any(len(vector) != self.dimensions for vector in vectors):
            raise AIServiceError(
                "Embedding provider returned an unexpected vector shape.",
                details={"expected_dimensions": self.dimensions},
            )
        logger.info(
            "ollama_embedding_completed",
            count=len(vectors),
            dimensions=self.dimensions,
            model=self.settings.embedding_model,
        )
        return vectors

    async def embed_query(self, text: str) -> list[float]:
        """Embed one query."""
        vectors = await self.embed_documents([text])
        return vectors[0]


def build_embedding_service(settings: Settings) -> EmbeddingService:
    """Construct the free local embedding provider."""
    return OllamaEmbeddingProvider(settings)
