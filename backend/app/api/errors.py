"""Global exception handlers."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.logging import get_logger
from app.exceptions import AppError

logger = get_logger(__name__)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def register_exception_handlers(app: FastAPI) -> None:
    """Register stable error envelopes without leaking internals."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> ORJSONResponse:
        logger.warning("application_error", code=exc.code, message=exc.message)
        return ORJSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "request_id": _request_id(request),
                }
            },
            headers={"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> ORJSONResponse:
        errors = [
            {
                "loc": list(e.get("loc", [])),
                "msg": e.get("msg", ""),
                "type": e.get("type", ""),
            }
            for e in exc.errors()
        ]
        return ORJSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "request_validation_error",
                    "message": "The request payload is invalid.",
                    "details": {"errors": errors},
                    "request_id": _request_id(request),
                }
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_handler(request: Request, exc: SQLAlchemyError) -> ORJSONResponse:
        logger.exception("database_error")
        return ORJSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "database_error",
                    "message": "The database is temporarily unavailable.",
                    "details": {},
                    "request_id": _request_id(request),
                }
            },
        )

    @app.exception_handler(Exception)
    async def unexpected_handler(request: Request, exc: Exception) -> ORJSONResponse:
        logger.exception("unexpected_error")
        return ORJSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "details": {},
                    "request_id": _request_id(request),
                }
            },
        )
