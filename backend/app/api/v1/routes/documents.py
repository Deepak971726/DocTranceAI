"""Document ingestion, semantic search, summary, and FAQ endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.dependencies.auth import get_verified_user
from app.dependencies.services import (
    get_document_processor,
    get_document_service,
    get_generation_service,
    get_rag_service,
)
from app.exceptions import NotFoundError
from app.models.entities import User
from app.repositories.documents import DocumentRepository
from app.schemas.common import MessageResponse, Page
from app.schemas.documents import (
    DocumentResponse,
    DocumentUploadResponse,
    FAQResponse,
    SearchRequest,
    SearchResult,
    SummaryResponse,
)
from app.services.documents import DocumentProcessor, DocumentService
from app.services.generation import DocumentGenerationService
from app.services.rag import RAGService
from app.utils.files import read_and_validate_upload

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
    settings: Settings = Depends(get_settings),
    service: DocumentService = Depends(get_document_service),
    processor: DocumentProcessor = Depends(get_document_processor),
) -> DocumentUploadResponse:
    """Validate, store, and asynchronously process one document."""
    validated = await read_and_validate_upload(file, max_bytes=settings.max_upload_bytes)
    document = await service.upload(user.id, validated)
    background_tasks.add_task(processor.process_one, document.id)
    return DocumentUploadResponse(document=DocumentResponse.model_validate(document))


@router.get("", response_model=Page[DocumentResponse])
async def list_documents(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_db_session),
) -> Page[DocumentResponse]:
    """List documents owned by the authenticated user."""
    items, total = await DocumentRepository(session).list(user.id, limit=limit, offset=offset)
    return Page(
        items=[DocumentResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentResponse:
    """Get one tenant-owned document."""
    document = await DocumentRepository(session).get(user.id, document_id)
    if document is None:
        raise NotFoundError("Document not found.")
    return DocumentResponse.model_validate(document)


@router.delete("/{document_id}", response_model=MessageResponse)
async def delete_document(
    document_id: UUID,
    user: User = Depends(get_verified_user),
    service: DocumentService = Depends(get_document_service),
) -> MessageResponse:
    """Delete document bytes, vectors, and visible metadata."""
    await service.delete(user.id, document_id)
    return MessageResponse(message="Document deleted.")


@router.post("/search/semantic", response_model=list[SearchResult])
async def semantic_search(
    payload: SearchRequest,
    user: User = Depends(get_verified_user),
    rag: RAGService = Depends(get_rag_service),
) -> list[SearchResult]:
    """Search across the user's selected or complete document library."""
    result = await rag.retrieve(
        user_id=user.id,
        query=payload.query,
        document_ids=payload.document_ids,
        top_k=payload.top_k,
    )
    return [SearchResult.model_validate(item) for item in result.citations]


@router.post("/{document_id}/summary", response_model=SummaryResponse)
async def summarize_document(
    document_id: UUID,
    user: User = Depends(get_verified_user),
    service: DocumentGenerationService = Depends(get_generation_service),
) -> SummaryResponse:
    """Generate summary, executive summary, and key takeaways."""
    return await service.summary(user.id, document_id)


@router.post("/{document_id}/faqs", response_model=FAQResponse)
async def generate_faqs(
    document_id: UUID,
    user: User = Depends(get_verified_user),
    service: DocumentGenerationService = Depends(get_generation_service),
) -> FAQResponse:
    """Generate exactly twenty grounded FAQs."""
    return await service.faqs(user.id, document_id)
