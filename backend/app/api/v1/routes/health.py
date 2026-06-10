"""Liveness, readiness, and Prometheus metrics endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.dependencies.services import get_vector_store
from app.integrations.qdrant import QdrantVectorStore

router = APIRouter(tags=["Operations"])


@router.get("/health/live")
async def liveness() -> dict[str, str]:
    """Return process liveness."""
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    vector_store: QdrantVectorStore = Depends(get_vector_store),
) -> dict[str, object]:
    """Check PostgreSQL and Qdrant readiness."""
    checks: dict[str, str] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "failed"
    try:
        await vector_store.client.get_collections()
        checks["qdrant"] = "ok"
    except Exception:
        checks["qdrant"] = "failed"
    ready = all(value == "ok" for value in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ready else "degraded", "checks": checks}


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Expose Prometheus metrics."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
