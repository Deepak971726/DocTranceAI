"""Shared response and pagination schemas."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base model capable of validating SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Simple operation result."""

    message: str


class ErrorBody(BaseModel):
    """Stable machine-readable API error body."""

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str | None = None


class ErrorResponse(BaseModel):
    """Top-level error envelope."""

    error: ErrorBody


class Page(BaseModel, Generic[T]):
    """Offset pagination envelope."""

    items: list[T]
    total: int
    limit: int
    offset: int
