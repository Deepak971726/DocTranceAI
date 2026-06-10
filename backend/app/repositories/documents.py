"""Tenant-scoped document and chunk persistence."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Document, DocumentChunk
from app.models.enums import DocumentStatus


class DocumentRepository:
    """Document queries that always enforce tenant ownership."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, **values: Any) -> Document:
        """Create upload metadata before external storage is called."""
        document = Document(**values)
        self.session.add(document)
        await self.session.flush()
        return document

    async def get(
        self,
        user_id: UUID,
        document_id: UUID,
        *,
        for_update: bool = False,
    ) -> Document | None:
        """Find a non-deleted document belonging to one user."""
        statement = select(Document).where(
            Document.id == document_id,
            Document.user_id == user_id,
            Document.deleted_at.is_(None),
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_many_ready(self, user_id: UUID, document_ids: list[UUID]) -> list[Document]:
        """Fetch selected ready documents and reject cross-tenant IDs by omission."""
        result = await self.session.execute(
            select(Document).where(
                Document.user_id == user_id,
                Document.id.in_(document_ids),
                Document.status == DocumentStatus.READY,
                Document.deleted_at.is_(None),
            )
        )
        return list(result.scalars().all())

    async def list(self, user_id: UUID, *, limit: int, offset: int) -> tuple[list[Document], int]:
        """List tenant documents with total count."""
        filters = (Document.user_id == user_id, Document.deleted_at.is_(None))
        items_result = await self.session.execute(
            select(Document)
            .where(*filters)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        count_result = await self.session.execute(select(func.count(Document.id)).where(*filters))
        return list(items_result.scalars().all()), int(count_result.scalar_one())

    async def count_active(self, user_id: UUID) -> int:
        """Count non-deleted tenant documents for plan enforcement."""
        result = await self.session.execute(
            select(func.count(Document.id)).where(
                Document.user_id == user_id, Document.deleted_at.is_(None)
            )
        )
        return int(result.scalar_one())

    async def total_storage_bytes(self, user_id: UUID) -> int:
        """Return current storage represented by non-deleted documents."""
        result = await self.session.execute(
            select(func.coalesce(func.sum(Document.file_size), 0)).where(
                Document.user_id == user_id,
                Document.deleted_at.is_(None),
            )
        )
        return int(result.scalar_one())

    async def mark_processing(self, document: Document) -> None:
        """Make an uploaded document available to background workers."""
        document.status = DocumentStatus.PROCESSING
        document.processing_error = None
        await self.session.flush()

    async def claim(
        self,
        *,
        document_id: UUID | None,
        stale_minutes: int,
        max_retries: int,
    ) -> Document | None:
        """Claim one job through a private function, then establish its tenant context."""
        result = await self.session.execute(
            text(
                """
                SELECT * FROM private.claim_document(
                    :document_id,
                    :stale_minutes,
                    :max_retries
                )
                """
            ),
            {
                "document_id": document_id,
                "stale_minutes": stale_minutes,
                "max_retries": max_retries,
            },
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        user_id = UUID(str(row["user_id"]))
        await self.session.execute(
            select(func.set_config("app.current_user_id", str(user_id), True))
        )
        claimed = await self.session.execute(
            select(Document).where(
                Document.id == UUID(str(row["document_id"])),
                Document.user_id == user_id,
            )
        )
        return claimed.scalar_one_or_none()

    async def replace_chunks(
        self,
        document: Document,
        chunks: list[dict[str, Any]],
    ) -> list[DocumentChunk]:
        """Replace relational chunks after extraction and before vector upsert."""
        await self.session.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_id == document.id,
                DocumentChunk.user_id == document.user_id,
            )
        )
        models = [
            DocumentChunk(document_id=document.id, user_id=document.user_id, **chunk)
            for chunk in chunks
        ]
        self.session.add_all(models)
        await self.session.flush()
        return models

    async def mark_ready(
        self,
        document: Document,
        *,
        page_count: int | None,
        chunk_count: int,
        metadata: dict[str, Any],
    ) -> None:
        """Complete successful ingestion."""
        document.status = DocumentStatus.READY
        document.page_count = page_count
        document.chunk_count = chunk_count
        document.document_metadata = metadata
        document.processing_completed_at = datetime.now(timezone.utc)
        document.processing_error = None
        await self.session.flush()

    async def mark_failed(self, document: Document, error: str) -> None:
        """Persist a safe processing failure reason."""
        document.status = DocumentStatus.FAILED
        document.processing_error = error[:4000]
        document.processing_completed_at = datetime.now(timezone.utc)
        await self.session.flush()

    async def release_for_retry(self, document: Document, error: str) -> None:
        """Release a failed claim so a durable worker can retry it."""
        document.status = DocumentStatus.PROCESSING
        document.processing_started_at = None
        document.processing_error = error[:4000]
        await self.session.flush()

    async def list_chunks(
        self, user_id: UUID, document_id: UUID, *, limit: int = 5000
    ) -> list[DocumentChunk]:
        """Return ordered tenant chunks for whole-document generation tasks."""
        result = await self.session.execute(
            select(DocumentChunk)
            .where(
                DocumentChunk.user_id == user_id,
                DocumentChunk.document_id == document_id,
                DocumentChunk.deleted_at.is_(None),
            )
            .order_by(DocumentChunk.chunk_index)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def soft_delete(self, document: Document) -> None:
        """Hide a document immediately while external deletion completes."""
        document.deleted_at = datetime.now(timezone.utc)
        await self.session.flush()
