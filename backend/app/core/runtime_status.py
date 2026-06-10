"""Startup dependency probes and runtime status logging."""

from __future__ import annotations

import httpx
from sqlalchemy import text

from app.core.config import Settings
from app.core.logging import get_logger
from app.db.session import engine
from app.dependencies.services import get_llm, get_vector_store

logger = get_logger(__name__)


async def log_runtime_status(*, settings: Settings, process_name: str) -> None:
    """Probe the core external dependencies and log concise status events."""
    llm = get_llm()

    logger.info("probe_postgres_start", process=process_name)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        logger.info(
            "probe_postgres_ok — database reachable and responding",
            process=process_name,
            url=str(engine.url).split("@")[-1],
        )
    except Exception as exc:
        logger.exception(
            "probe_postgres_failed — database is unreachable; writes will fail",
            process=process_name,
            error=str(exc),
            url=str(engine.url).split("@")[-1],
        )

    vector_store = get_vector_store()
    logger.info("probe_qdrant_start", process=process_name)
    try:
        collections = await vector_store.client.get_collections()
        logger.info(
            "probe_qdrant_ok — vector store reachable",
            process=process_name,
            collections=[c.name for c in collections.collections],
        )
    except Exception:
        logger.warning(
            "probe_qdrant_failed — vector store is unreachable; retrieval will fail",
            process=process_name,
        )

    logger.info("probe_ollama_start", process=process_name, model=llm.model_name)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
            tags = response.json().get("models", [])
        logger.info(
            "probe_ollama_ok — LLM service reachable",
            process=process_name,
            model=llm.model_name,
            available_models=[m.get("name") for m in tags],
        )
    except Exception:
        logger.warning(
            "probe_ollama_failed — LLM service unreachable; chat and generation will fail",
            process=process_name,
            model=llm.model_name,
        )
