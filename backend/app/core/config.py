"""Environment-backed application configuration."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated settings loaded from environment variables and an optional .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "DocTraceAI API"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    debug: bool = Field(default=False, validation_alias="APP_DEBUG")
    api_v1_prefix: str = "/api/v1"
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    trusted_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/doctraceai"
    database_pool_size: int = Field(default=10, ge=1, le=100)
    database_max_overflow: int = Field(default=20, ge=0, le=100)
    database_ssl_require: bool = True

    jwt_secret_key: SecretStr = SecretStr("development-only-secret-change-me")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, ge=5, le=1440)
    refresh_token_expire_days: int = Field(default=30, ge=1, le=365)
    password_reset_expire_minutes: int = Field(default=30, ge=5, le=1440)

    supabase_url: str = "https://example.supabase.co"
    supabase_service_role_key: SecretStr = SecretStr("development-placeholder")
    supabase_storage_bucket: str = "documents"

    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = "document_chunks"

    embedding_model: str = "nomic-embed-text"
    embedding_dimensions: int = Field(default=768, ge=32, le=4096)
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "qwen3:4b"

    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024)
    max_documents_free: int = Field(default=5, ge=1)
    chunk_size: int = Field(default=800, ge=200, le=4000)
    chunk_overlap: int = Field(default=150, ge=0, le=1000)
    rag_top_k: int = Field(default=6, ge=1, le=30)
    rag_score_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    worker_poll_seconds: int = Field(default=5, ge=1, le=300)
    worker_stale_minutes: int = Field(default=20, ge=1, le=1440)
    worker_max_retries: int = Field(default=3, ge=1, le=20)

    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from_email: str = "noreply@example.com"
    smtp_use_tls: bool = True

    log_level: str = "INFO"
    log_json: bool = False

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        """Reject unsafe production configuration."""
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")
        if self.app_env in {"staging", "production"}:
            if len(self.jwt_secret_key.get_secret_value()) < 32:
                raise ValueError("JWT_SECRET_KEY must contain at least 32 characters")
            if "placeholder" in self.supabase_service_role_key.get_secret_value().lower():
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY must be configured")
        return self

    @property
    def is_production(self) -> bool:
        """Return whether production hardening must be applied."""
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide immutable settings instance."""
    return Settings()
