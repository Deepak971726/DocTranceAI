"""Asynchronous Supabase Storage adapter using the documented HTTP API."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
)
from app.exceptions import StorageError

logger = get_logger(__name__)


class SupabaseStorage:
    """Private bucket operations performed only with a server-side service key."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = client

    def _headers(self) -> dict[str, str]:
        key = self.settings.supabase_service_role_key.get_secret_value()
        return {"apikey": key, "Authorization": f"Bearer {key}"}

    def _object_url(self, bucket: str, path: str) -> str:
        safe_bucket = quote(bucket, safe="")
        safe_path = quote(path, safe="/")
        base_url = self.settings.supabase_url.rstrip("/")
        return f"{base_url}/storage/v1/object/{safe_bucket}/{safe_path}"

    async def upload(
        self,
        *,
        bucket: str,
        path: str,
        content: bytes,
        content_type: str,
    ) -> None:
        """Upload a new object without upsert to avoid accidental overwrites."""
        process = "Store file"
        headers = {
            **self._headers(),
            "Content-Type": content_type,
            "Cache-Control": "private, max-age=0, no-store",
            "x-upsert": "false",
        }
        log_process_started(logger, process, bucket=bucket, path=path, bytes=len(content))
        try:
            async with self._client or httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self._object_url(bucket, path), headers=headers, content=content
                )
                response.raise_for_status()
        except (httpx.HTTPError, RuntimeError) as exc:
            log_process_failed(logger, process, bucket=bucket, path=path)
            raise StorageError() from exc
        log_process_finished(logger, process, bucket=bucket, path=path, bytes=len(content))

    async def download(self, *, bucket: str, path: str) -> bytes:
        """Download one private object."""
        process = "Download stored file"
        log_process_started(logger, process, bucket=bucket, path=path)
        try:
            async with self._client or httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(self._object_url(bucket, path), headers=self._headers())
                response.raise_for_status()
                content = response.content
        except (httpx.HTTPError, RuntimeError) as exc:
            log_process_failed(logger, process, bucket=bucket, path=path)
            raise StorageError() from exc
        log_process_finished(logger, process, bucket=bucket, path=path, bytes=len(content))
        return content

    async def delete(self, *, bucket: str, path: str) -> None:
        """Delete one private object from a bucket."""
        process = "Delete stored file"
        safe_bucket = quote(bucket, safe="")
        url = f"{self.settings.supabase_url.rstrip('/')}/storage/v1/object/{safe_bucket}"
        log_process_started(logger, process, bucket=bucket, path=path)
        try:
            async with self._client or httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    "DELETE",
                    url,
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={"prefixes": [path]},
                )
                response.raise_for_status()
        except (httpx.HTTPError, RuntimeError) as exc:
            log_process_failed(logger, process, bucket=bucket, path=path)
            raise StorageError() from exc
        log_process_finished(logger, process, bucket=bucket, path=path)
