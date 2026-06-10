"""Document, search, summary, and FAQ contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import DocumentStatus
from app.schemas.common import ORMModel


class DocumentResponse(ORMModel):
    """Uploaded document metadata visible to its owner."""

    id: UUID
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    status: DocumentStatus
    processing_error: str | None
    page_count: int | None
    chunk_count: int
    document_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DocumentUploadResponse(BaseModel):
    """Upload acceptance and asynchronous processing state."""

    document: DocumentResponse
    message: str = "Upload accepted and document processing started."


class SearchRequest(BaseModel):
    """Tenant-scoped semantic document search."""

    query: str = Field(min_length=2, max_length=2000)
    document_ids: list[UUID] | None = Field(default=None, max_length=50)
    top_k: int = Field(default=10, ge=1, le=50)


class Citation(BaseModel):
    """Source attribution returned with generated answers."""

    reference: str
    document_id: UUID
    document_name: str
    page_number: int | None
    chunk_id: UUID
    chunk_index: int
    score: float | None = None
    excerpt: str


class SearchResult(Citation):
    """Semantic search result."""

    pass


class SummaryResponse(BaseModel):
    """Generated document summary with citations."""

    document_id: UUID
    content: str
    citations: list[Citation]


class FAQItem(BaseModel):
    """One generated FAQ."""

    question: str
    answer: str
    citations: list[str] = Field(default_factory=list)


class FAQResponse(BaseModel):
    """Twenty generated FAQs for one document."""

    document_id: UUID
    faqs: list[FAQItem]
