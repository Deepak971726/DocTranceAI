"""Dependency-injected provider and service constructors."""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import AsyncSessionFactory, get_db_session
from app.integrations.email import EmailService
from app.integrations.embeddings import EmbeddingService, build_embedding_service
from app.integrations.ollama import OllamaChatService
from app.integrations.qdrant import QdrantVectorStore
from app.integrations.supabase_storage import SupabaseStorage
from app.services.account import AccountService
from app.services.auth import AuthService
from app.services.chat import ChatService
from app.services.documents import DocumentProcessor, DocumentService
from app.services.generation import DocumentGenerationService
from app.services.rag import RAGService


@lru_cache(maxsize=1)
def get_storage() -> SupabaseStorage:
    """Return the process-wide stateless storage adapter."""
    return SupabaseStorage(get_settings())


@lru_cache(maxsize=1)
def get_embeddings() -> EmbeddingService:
    """Return the selected embedding provider."""
    return build_embedding_service(get_settings())


@lru_cache(maxsize=1)
def get_vector_store() -> QdrantVectorStore:
    """Return the shared asynchronous Qdrant client."""
    return QdrantVectorStore(get_settings())


@lru_cache(maxsize=1)
def get_llm() -> OllamaChatService:
    """Return the Ollama chat adapter."""
    return OllamaChatService(get_settings())


@lru_cache(maxsize=1)
def get_document_processor() -> DocumentProcessor:
    """Return the durable processor shared by background tasks and worker."""
    return DocumentProcessor(
        session_factory=AsyncSessionFactory,
        settings=get_settings(),
        storage=get_storage(),
        embeddings=get_embeddings(),
        vector_store=get_vector_store(),
    )


def get_auth_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    """Build request-scoped authentication service."""
    return AuthService(session, settings, EmailService(settings))


def get_document_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> DocumentService:
    """Build request-scoped document service."""
    return DocumentService(session, settings, get_storage(), get_vector_store())


def get_rag_service() -> RAGService:
    """Build a provider-composed RAG service."""
    return RAGService(get_settings(), get_embeddings(), get_vector_store(), get_llm())


def get_chat_service(
    session: AsyncSession = Depends(get_db_session),
) -> ChatService:
    """Build request-scoped chat service."""
    return ChatService(
        session=session,
        session_factory=AsyncSessionFactory,
        rag=get_rag_service(),
    )


def get_generation_service(
    session: AsyncSession = Depends(get_db_session),
) -> DocumentGenerationService:
    """Build request-scoped derived-content service."""
    return DocumentGenerationService(session, get_llm())


def get_account_service(
    session: AsyncSession = Depends(get_db_session),
) -> AccountService:
    """Build request-scoped account service."""
    return AccountService(session)
