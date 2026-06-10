"""Asynchronous Supabase Storage adapter using the documented HTTP API."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.core.logging import get_logger
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
        headers = {
            **self._headers(),
            "Content-Type": content_type,
            "Cache-Control": "private, max-age=0, no-store",
            "x-upsert": "false",
        }
        logger.info(
            "storage_upload_started — pushing file bytes to Supabase bucket",
            bucket=bucket,
            path=path,
            bytes=len(content),
        )
        try:
            async with self._client or httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self._object_url(bucket, path), headers=headers, content=content
                )
                response.raise_for_status()
        except (httpx.HTTPError, RuntimeError) as exc:
            logger.exception(
                "storage_upload_failed — file bytes not persisted",
                bucket=bucket,
                path=path,
            )
            raise StorageError() from exc
        logger.info(
            "storage_upload_completed — file is now in Supabase Storage",
            bucket=bucket,
            path=path,
        )

    async def download(self, *, bucket: str, path: str) -> bytes:
        """Download one private object."""
        logger.info(
            "storage_download_started — fetching file from Supabase bucket",
            bucket=bucket,
            path=path,
        )
        try:
            async with self._client or httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(self._object_url(bucket, path), headers=self._headers())
                response.raise_for_status()
                content = response.content
        except (httpx.HTTPError, RuntimeError) as exc:
            logger.exception(
                "storage_download_failed — could not retrieve file bytes",
                bucket=bucket,
                path=path,
            )
            raise StorageError() from exc
        logger.info(
            "storage_download_completed",
            bucket=bucket,
            path=path,
            bytes=len(content),
        )
        return content

    async def delete(self, *, bucket: str, path: str) -> None:
        """Delete one private object from a bucket."""
        safe_bucket = quote(bucket, safe="")
        url = f"{self.settings.supabase_url.rstrip('/')}/storage/v1/object/{safe_bucket}"
        logger.info(
            "storage_delete_started — requesting removal from Supabase bucket",
            bucket=bucket,
            path=path,
        )
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
            logger.exception(
                "storage_delete_failed — file may still exist in bucket",
                bucket=bucket,
                path=path,
            )
            raise StorageError() from exc
        logger.info(
            "storage_delete_completed — file removed from Supabase bucket",
            bucket=bucket,
            path=path,
        )
