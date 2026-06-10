"""Typed exceptions translated into stable API error responses."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base exception carrying an HTTP-safe code and details."""

    status_code = 500
    code = "internal_error"
    default_message = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message or self.default_message)
        self.message = message or self.default_message
        self.details = details or {}


class ValidationError(AppError):
    """Request or domain validation failed."""

    status_code = 422
    code = "validation_error"
    default_message = "The supplied data is invalid."


class AuthenticationError(AppError):
    """Authentication credentials are missing or invalid."""

    status_code = 401
    code = "authentication_error"
    default_message = "Authentication is required."


class AuthorizationError(AppError):
    """The authenticated principal cannot perform the operation."""

    status_code = 403
    code = "authorization_error"
    default_message = "You do not have permission to perform this operation."


class NotFoundError(AppError):
    """The tenant-scoped resource does not exist."""

    status_code = 404
    code = "not_found"
    default_message = "The requested resource was not found."


class ConflictError(AppError):
    """A uniqueness or state transition conflict occurred."""

    status_code = 409
    code = "conflict"
    default_message = "The request conflicts with the current resource state."


class StorageError(AppError):
    """Supabase Storage failed."""

    status_code = 502
    code = "storage_error"
    default_message = "Document storage is temporarily unavailable."


class VectorDatabaseError(AppError):
    """Qdrant failed."""

    status_code = 502
    code = "vector_database_error"
    default_message = "Vector search is temporarily unavailable."


class AIServiceError(AppError):
    """An embedding or language model provider failed."""

    status_code = 502
    code = "ai_service_error"
    default_message = "The AI service is temporarily unavailable."
