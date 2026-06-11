"""Qdrant collection lifecycle and tenant-filtered vector operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from qdrant_client import AsyncQdrantClient, models

from app.core.config import Settings
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
)
from app.exceptions import VectorDatabaseError

logger = get_logger(__name__)


@dataclass(slots=True)
class VectorSearchHit:
    """Normalized Qdrant result."""

    point_id: UUID
    score: float
    payload: dict[str, Any]


class QdrantVectorStore:
    """Vector persistence with mandatory user-level payload filtering."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        api_key = (
            settings.qdrant_api_key.get_secret_value()
            if settings.qdrant_api_key is not None
            else None
        )
        self.client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=api_key,
            timeout=60,
        )

    async def ensure_collection(self) -> None:
        """Create the vector collection and filter indexes idempotently."""
        process = "Ensure vector collection"
        log_process_started(
            logger,
            process,
            collection=self.settings.qdrant_collection,
        )
        try:
            exists = await self.client.collection_exists(self.settings.qdrant_collection)
            if not exists:
                await self.client.create_collection(
                    collection_name=self.settings.qdrant_collection,
                    vectors_config=models.VectorParams(
                        size=self.settings.embedding_dimensions,
                        distance=models.Distance.COSINE,
                    ),
                    hnsw_config=models.HnswConfigDiff(payload_m=16),
                    on_disk_payload=True,
                )
                for field in ("user_id", "document_id"):
                    await self.client.create_payload_index(
                        collection_name=self.settings.qdrant_collection,
                        field_name=field,
                        field_schema=models.PayloadSchemaType.KEYWORD,
                    )
        except Exception as exc:
            log_process_failed(
                logger,
                process,
                collection=self.settings.qdrant_collection,
            )
            raise VectorDatabaseError() from exc
        log_process_finished(
            logger,
            process,
            collection=self.settings.qdrant_collection,
            created=not exists,
            dimensions=self.settings.embedding_dimensions,
        )

    async def upsert_chunks(
        self,
        *,
        chunks: list[Any],
        vectors: list[list[float]],
        filename: str,
        created_at: datetime,
    ) -> None:
        """Upsert chunk vectors using stable database-generated point IDs."""
        if len(chunks) != len(vectors):
            raise VectorDatabaseError("Chunk and vector counts do not match.")
        process = "Store vectors"
        log_process_started(
            logger,
            process,
            collection=self.settings.qdrant_collection,
            points=len(vectors),
        )
        points = [
            models.PointStruct(
                id=str(chunk.qdrant_point_id),
                vector=vector,
                payload={
                    "user_id": str(chunk.user_id),
                    "document_id": str(chunk.document_id),
                    "chunk_id": str(chunk.id),
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "chunk_text": chunk.chunk_text,
                    "filename": filename,
                    "created_at": created_at.isoformat(),
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        try:
            await self.client.upsert(
                collection_name=self.settings.qdrant_collection,
                points=points,
                wait=True,
            )
        except Exception as exc:
            log_process_failed(logger, process, points=len(points))
            raise VectorDatabaseError() from exc
        log_process_finished(
            logger,
            process,
            collection=self.settings.qdrant_collection,
            points=len(points),
        )

    async def search(
        self,
        *,
        user_id: UUID,
        query_vector: list[float],
        document_ids: list[UUID] | None,
        top_k: int,
        score_threshold: float | None,
    ) -> list[VectorSearchHit]:
        """Search vectors with an unskippable tenant filter."""
        process = "Vector search"
        log_process_started(
            logger,
            process,
            tenant=str(user_id),
            selected_documents=len(document_ids or []),
            top_k=top_k,
        )
        must: list[models.FieldCondition] = [
            models.FieldCondition(
                key="user_id",
                match=models.MatchValue(value=str(user_id)),
            )
        ]
        if document_ids:
            must.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchAny(any=[str(item) for item in document_ids]),
                )
            )
        try:
            response = await self.client.query_points(
                collection_name=self.settings.qdrant_collection,
                query=query_vector,
                query_filter=models.Filter(must=must),
                limit=top_k,
                score_threshold=score_threshold,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as exc:
            log_process_failed(logger, process, tenant=str(user_id), top_k=top_k)
            raise VectorDatabaseError() from exc
        log_process_finished(
            logger,
            process,
            tenant=str(user_id),
            hits=len(response.points),
            top_k=top_k,
        )
        return [
            VectorSearchHit(
                point_id=UUID(str(point.id)),
                score=float(point.score),
                payload=dict(point.payload or {}),
            )
            for point in response.points
        ]

    async def delete_document(self, *, user_id: UUID, document_id: UUID) -> None:
        """Delete vectors only when both tenant and document IDs match."""
        process = "Delete document vectors"
        log_process_started(
            logger,
            process,
            tenant=str(user_id),
            document_id=str(document_id),
        )
        selector = models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="user_id", match=models.MatchValue(value=str(user_id))
                    ),
                    models.FieldCondition(
                        key="document_id", match=models.MatchValue(value=str(document_id))
                    ),
                ]
            )
        )
        try:
            await self.client.delete(
                collection_name=self.settings.qdrant_collection,
                points_selector=selector,
                wait=True,
            )
        except Exception as exc:
            log_process_failed(
                logger,
                process,
                tenant=str(user_id),
                document_id=str(document_id),
            )
            raise VectorDatabaseError() from exc
        log_process_finished(
            logger,
            process,
            tenant=str(user_id),
            document_id=str(document_id),
        )

    async def close(self) -> None:
        """Close transport resources."""
        await self.client.close()
