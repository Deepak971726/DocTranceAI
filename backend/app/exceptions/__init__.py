"""Application exception hierarchy."""

from app.exceptions.base import (
    AIServiceError,
    AppError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
    StorageError,
    ValidationError,
    VectorDatabaseError,
)

__all__ = [
    "AIServiceError",
    "AppError",
    "AuthenticationError",
    "AuthorizationError",
    "ConflictError",
    "NotFoundError",
    "StorageError",
    "ValidationError",
    "VectorDatabaseError",
]
