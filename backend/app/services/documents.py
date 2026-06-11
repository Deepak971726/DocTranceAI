"""Document upload, listing, deletion, and durable ingestion services."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
    request_id_context,
)
from app.db.tenancy import set_tenant_context
from app.exceptions import NotFoundError, ValidationError
from app.integrations.embeddings import EmbeddingService
from app.integrations.qdrant import QdrantVectorStore
from app.integrations.supabase_storage import SupabaseStorage
from app.models.entities import Document
from app.models.enums import DocumentStatus
from app.repositories.documents import DocumentRepository
from app.repositories.usage import AuditRepository, UsageRepository
from app.services.chunking import DocumentChunker
from app.services.extraction import extract_document
from app.utils.files import ValidatedUpload

logger = get_logger(__name__)


class DocumentService:
    """Request-facing document operations."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        storage: SupabaseStorage,
        vector_store: QdrantVectorStore,
    ) -> None:
        self.session = session
        self.settings = settings
        self.storage = storage
        self.vector_store = vector_store
        self.documents = DocumentRepository(session)
        self.usage = UsageRepository(session)
        self.audit = AuditRepository(session)

    async def upload(self, user_id: UUID, upload: ValidatedUpload) -> Document:
        """Persist upload state, store bytes, and enqueue via PostgreSQL status."""
        log_process_started(
            logger,
            "Upload document",
            user_id=str(user_id),
            filename=upload.safe_filename,
            bytes=len(upload.content),
        )
        subscription = await self.usage.get_subscription(user_id, for_update=True)
        usage_limits = subscription.usage_limits if subscription else {}
        storage_limit = int(usage_limits.get("storage_bytes", 100 * 1024 * 1024))
        current_storage = await self.documents.total_storage_bytes(user_id)
        if current_storage + len(upload.content) > storage_limit:
            raise ValidationError("Your plan's storage limit has been reached.")
        document_id = uuid4()
        storage_path = f"{user_id}/{document_id}/{uuid4().hex}-{upload.safe_filename}"
        log_process_started(
            logger,
            "Create document database record",
            user_id=str(user_id),
            document_id=str(document_id),
        )
        document = await self.documents.create(
            id=document_id,
            user_id=user_id,
            filename=upload.safe_filename,
            original_filename=upload.original_filename,
            content_type=upload.content_type,
            file_size=len(upload.content),
            checksum_sha256=upload.checksum_sha256,
            storage_bucket=self.settings.supabase_storage_bucket,
            storage_path=storage_path,
            status=DocumentStatus.UPLOADING,
        )
        await self.session.commit()
        log_process_finished(
            logger,
            "Create document database record",
            user_id=str(user_id),
            document_id=str(document_id),
        )
        try:
            await self.storage.upload(
                bucket=document.storage_bucket,
                path=document.storage_path,
                content=upload.content,
                content_type=document.content_type,
            )
            await set_tenant_context(self.session, user_id)
            document = await self.documents.get(user_id, document_id, for_update=True)
            if document is None:
                raise NotFoundError("Document record disappeared during upload.")
            log_process_started(
                logger,
                "Mark document processing",
                user_id=str(user_id),
                document_id=str(document_id),
            )
            await self.documents.mark_processing(document)
            await self.usage.increment(
                user_id, documents_uploaded=1, storage_bytes=document.file_size
            )
            await self.audit.record(
                user_id=user_id,
                action="document.uploaded",
                resource_type="document",
                resource_id=document.id,
                request_id=request_id_context.get(),
                event_metadata={
                    "filename": document.filename,
                    "bytes": document.file_size,
                },
            )
            # On-update SQL expressions expire their ORM attributes after flush. Reload them
            # while the async session is active so response serialization cannot trigger I/O.
            await self.session.refresh(document)
            await self.session.commit()
            log_process_finished(
                logger,
                "Mark document processing",
                user_id=str(user_id),
                document_id=str(document_id),
            )
        except Exception as exc:
            log_process_failed(
                logger,
                "Upload document",
                user_id=str(user_id),
                document_id=str(document_id),
            )
            await self.session.rollback()
            await set_tenant_context(self.session, user_id)
            failed = await self.documents.get(user_id, document_id, for_update=True)
            if failed is not None:
                await self.documents.mark_failed(failed, "Storage upload failed.")
                await self.session.commit()
            raise exc
        logger.info(
            "document_upload_accepted — file stored in Supabase, marked PROCESSING, worker will pick it up",
            document_id=str(document.id),
            user_id=str(user_id),
            filename=document.filename,
            bytes=document.file_size,
        )
        log_process_finished(
            logger,
            "Upload document",
            user_id=str(user_id),
            document_id=str(document.id),
            filename=document.filename,
        )
        return document

    async def delete(self, user_id: UUID, document_id: UUID) -> None:
        """Delete external data and then soft-delete tenant metadata."""
        log_process_started(
            logger,
            "Delete document",
            user_id=str(user_id),
            document_id=str(document_id),
        )
        document = await self.documents.get(user_id, document_id, for_update=True)
        if document is None:
            raise NotFoundError("Document not found.")
        await self.storage.delete(bucket=document.storage_bucket, path=document.storage_path)
        await self.vector_store.delete_document(user_id=user_id, document_id=document.id)
        await self.documents.soft_delete(document)
        await self.audit.record(
            user_id=user_id,
            action="document.deleted",
            resource_type="document",
            resource_id=document.id,
            request_id=request_id_context.get(),
        )
        await self.session.commit()
        log_process_finished(
            logger,
            "Delete document",
            user_id=str(user_id),
            document_id=str(document_id),
        )
        logger.info(
            "document_deleted — removed from storage, vectors purged, record soft-deleted",
            document_id=str(document_id),
            user_id=str(user_id),
        )


class DocumentProcessor:
    """Queue-free durable processor claimed through PostgreSQL row locks."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
        storage: SupabaseStorage,
        embeddings: EmbeddingService,
        vector_store: QdrantVectorStore,
    ) -> None:
        self.session_factory = session_factory
        self.settings = settings
        self.storage = storage
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.chunker = DocumentChunker(settings.chunk_size, settings.chunk_overlap)

    async def process_one(self, document_id: UUID | None = None) -> bool:
        """Claim and process one document; return whether work was found."""
        async with self.session_factory() as session:
            repository = DocumentRepository(session)
            document = await repository.claim(
                document_id=document_id,
                stale_minutes=self.settings.worker_stale_minutes,
                max_retries=self.settings.worker_max_retries,
            )
            if document is None:
                await session.rollback()
                return False
            claimed = {
                "id": document.id,
                "user_id": document.user_id,
                "bucket": document.storage_bucket,
                "path": document.storage_path,
                "filename": document.filename,
                "created_at": document.created_at,
                "retry_count": document.retry_count,
            }
            await session.commit()

        logger.info(
            "document_claimed — starting extraction pipeline",
            document_id=str(claimed["id"]),
            user_id=str(claimed["user_id"]),
            filename=claimed["filename"],
            retry_count=claimed["retry_count"],
        )
        log_process_started(
            logger,
            "Process document",
            document_id=str(claimed["id"]),
            user_id=str(claimed["user_id"]),
            filename=claimed["filename"],
            retry_count=claimed["retry_count"],
        )
        try:
            content = await self.storage.download(
                bucket=str(claimed["bucket"]), path=str(claimed["path"])
            )
            logger.info(
                "document_download_done — bytes fetched from Supabase Storage, running extractor",
                document_id=str(claimed["id"]),
                bytes=len(content),
                filename=claimed["filename"],
            )
            log_process_started(
                logger,
                "Extract text",
                document_id=str(claimed["id"]),
                filename=claimed["filename"],
            )
            log_process_started(
                logger,
                "Extract metadata",
                document_id=str(claimed["id"]),
                filename=claimed["filename"],
            )
            extraction = await asyncio.to_thread(
                extract_document, str(claimed["filename"]), content
            )
            log_process_finished(
                logger,
                "Extract text",
                document_id=str(claimed["id"]),
                pages=extraction.page_count,
                sections=len(extraction.sections),
            )
            log_process_finished(
                logger,
                "Extract metadata",
                document_id=str(claimed["id"]),
                metadata_fields=len(extraction.metadata),
            )
            logger.info(
                "document_extracted — text pulled, splitting into chunks",
                document_id=str(claimed["id"]),
                pages=extraction.page_count,
            )
            log_process_started(
                logger,
                "Chunk text",
                document_id=str(claimed["id"]),
                sections=len(extraction.sections),
            )
            text_chunks = self.chunker.split(extraction.sections)
            if not text_chunks:
                raise ValidationError("No chunks were produced from this document.")
            log_process_finished(
                logger,
                "Chunk text",
                document_id=str(claimed["id"]),
                chunks=len(text_chunks),
            )
            logger.info(
                "document_chunked — generating embeddings via Ollama",
                document_id=str(claimed["id"]),
                chunk_count=len(text_chunks),
            )
            vectors = await self.embeddings.embed_documents(
                [chunk.chunk_text for chunk in text_chunks]
            )
            logger.info(
                "embeddings_ready — upserting chunks to Postgres and vectors to Qdrant",
                document_id=str(claimed["id"]),
                vector_count=len(vectors),
            )
            rows: list[Any]
            log_process_started(
                logger,
                "Store document chunks",
                document_id=str(claimed["id"]),
                chunks=len(text_chunks),
            )
            async with self.session_factory() as session:
                await set_tenant_context(session, claimed["user_id"])
                repository = DocumentRepository(session)
                document = await repository.get(claimed["user_id"], claimed["id"], for_update=True)
                if document is None or document.deleted_at is not None:
                    await session.rollback()
                    return True
                rows = await repository.replace_chunks(
                    document,
                    [
                        {
                            "chunk_index": chunk.chunk_index,
                            "page_number": chunk.page_number,
                            "chunk_text": chunk.chunk_text,
                            "token_count": chunk.token_count,
                            "qdrant_point_id": uuid4(),
                            "chunk_metadata": chunk.chunk_metadata,
                        }
                        for chunk in text_chunks
                    ],
                )
                await session.commit()
            log_process_finished(
                logger,
                "Store document chunks",
                document_id=str(claimed["id"]),
                chunks=len(rows),
            )
            await self.vector_store.ensure_collection()
            await self.vector_store.delete_document(
                user_id=claimed["user_id"], document_id=claimed["id"]
            )
            await self.vector_store.upsert_chunks(
                chunks=rows,
                vectors=vectors,
                filename=str(claimed["filename"]),
                created_at=claimed["created_at"],
            )
            log_process_started(
                logger,
                "Mark document ready",
                document_id=str(claimed["id"]),
                chunks=len(rows),
            )
            async with self.session_factory() as session:
                await set_tenant_context(session, claimed["user_id"])
                repository = DocumentRepository(session)
                document = await repository.get(claimed["user_id"], claimed["id"], for_update=True)
                if document is not None:
                    await repository.mark_ready(
                        document,
                        page_count=extraction.page_count,
                        chunk_count=len(rows),
                        metadata=extraction.metadata,
                    )
                    await session.commit()
            log_process_finished(
                logger,
                "Mark document ready",
                document_id=str(claimed["id"]),
                pages=extraction.page_count,
                chunks=len(rows),
            )
            logger.info(
                "document_processing_completed — document is READY and fully searchable",
                document_id=str(claimed["id"]),
                user_id=str(claimed["user_id"]),
                chunks=len(rows),
                pages=extraction.page_count,
            )
            log_process_finished(
                logger,
                "Process document",
                document_id=str(claimed["id"]),
                user_id=str(claimed["user_id"]),
                pages=extraction.page_count,
                chunks=len(rows),
            )
        except Exception as exc:
            log_process_failed(
                logger,
                "Process document",
                document_id=str(claimed["id"]),
                user_id=str(claimed["user_id"]),
                attempt=claimed["retry_count"],
            )
            logger.exception(
                "document_processing_failed — will retry or mark FAILED if max retries exceeded",
                document_id=str(claimed["id"]),
                user_id=str(claimed["user_id"]),
                attempt=claimed["retry_count"],
                error=str(exc),
            )
            async with self.session_factory() as session:
                await set_tenant_context(session, claimed["user_id"])
                repository = DocumentRepository(session)
                document = await repository.get(claimed["user_id"], claimed["id"], for_update=True)
                if document is not None:
                    safe_error = f"{type(exc).__name__}: {str(exc)}"
                    if document.retry_count >= self.settings.worker_max_retries:
                        await repository.mark_failed(document, safe_error)
                    else:
                        await repository.release_for_retry(document, safe_error)
                    await session.commit()
        return True
