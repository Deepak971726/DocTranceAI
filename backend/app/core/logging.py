"""Structured logging configuration and request context helpers."""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_context: ContextVar[str | None] = ContextVar("user_id", default=None)


def add_context(
    _logger: logging.Logger, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Attach request and tenant identifiers to every structured event."""
    request_id = request_id_context.get()
    user_id = user_id_context.get()
    if request_id:
        event_dict["request_id"] = request_id
    if user_id:
        event_dict["user_id"] = user_id
    return event_dict


def configure_logging(level: str = "INFO", json_logs: bool = False) -> None:
    """Configure standard-library and structlog output once at process startup."""
    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        add_context,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(
        colors=sys.stderr.isatty() or sys.stdout.isatty()
    )
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
        force=True,
    )
    for noisy_logger in (
        "httpx",
        "httpcore",
        "qdrant_client",
        "sqlalchemy.engine",
        "sqlalchemy.pool",
        "asyncpg",
    ):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)
    structlog.configure(
        processors=[*processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a named structured logger."""
    return structlog.get_logger(name)


def log_process_started(
    logger: structlog.stdlib.BoundLogger,
    process: str,
    **context: Any,
) -> None:
    """Emit a consistent, human-readable process start event."""
    logger.info(
        "process_started",
        process=process,
        status="started",
        message=f"{process} process started.",
        **context,
    )


def log_process_finished(
    logger: structlog.stdlib.BoundLogger,
    process: str,
    **context: Any,
) -> None:
    """Emit a consistent, human-readable successful completion event."""
    logger.info(
        "process_finished_successfully",
        process=process,
        status="success",
        message=f"{process} process finished successfully.",
        **context,
    )


def log_process_failed(
    logger: structlog.stdlib.BoundLogger,
    process: str,
    **context: Any,
) -> None:
    """Emit a consistent failure event with the active exception traceback."""
    logger.exception(
        "process_failed",
        process=process,
        status="failed",
        message=f"{process} process failed.",
        **context,
    )
