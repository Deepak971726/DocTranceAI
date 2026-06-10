"""DocTraceAI FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.api.errors import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.runtime_status import log_runtime_status
from app.db.session import engine
from app.dependencies.services import get_vector_store
from app.middleware.request_context import RequestContextMiddleware, SecurityHeadersMiddleware

settings = get_settings()
configure_logging(settings.log_level, settings.log_json)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize external resources and release them on shutdown."""
    logger.info(
        "app_starting",
        environment=settings.app_env,
        debug=settings.debug,
        api_prefix=settings.api_v1_prefix,
    )
    logger.info("ensuring_qdrant_collection", collection=settings.qdrant_collection)
    try:
        await get_vector_store().ensure_collection()
        logger.info("qdrant_collection_ready", collection=settings.qdrant_collection)
    except Exception:
        logger.exception("qdrant_collection_check_failed — vector search will not work")
    logger.info("probing_external_dependencies")
    await log_runtime_status(settings=settings, process_name="api")
    logger.info("app_ready — accepting requests")
    yield
    logger.info("app_shutting_down — closing connections")
    await get_vector_store().close()
    logger.info("qdrant_client_closed")
    await engine.dispose()
    logger.info("database_engine_disposed")
    logger.info("app_stopped")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Secure multi-tenant document intelligence API.",
    debug=settings.debug,
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)
