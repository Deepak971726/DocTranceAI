"""Document service regression tests."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models.entities import Document
from app.models.enums import DocumentStatus
from app.services.documents import DocumentService
from app.utils.files import ValidatedUpload


@pytest.mark.asyncio
async def test_upload_ignores_legacy_document_limit_and_refreshes_response_fields() -> None:
    session = AsyncMock()
    storage = AsyncMock()
    vector_store = AsyncMock()
    service = DocumentService(session, Settings(), storage, vector_store)
    user_id = uuid4()
    now = datetime.now(timezone.utc)
    document = Document(
        id=uuid4(),
        user_id=user_id,
        filename="report.pdf",
        original_filename="report.pdf",
        content_type="application/pdf",
        file_size=12,
        checksum_sha256="a" * 64,
        storage_bucket="documents",
        storage_path=f"{user_id}/report.pdf",
        status=DocumentStatus.UPLOADING,
        chunk_count=0,
        document_metadata={},
        created_at=now,
        updated_at=now,
    )
    service.documents = SimpleNamespace(
        total_storage_bytes=AsyncMock(return_value=0),
        create=AsyncMock(return_value=document),
        get=AsyncMock(return_value=document),
        mark_processing=AsyncMock(),
        mark_failed=AsyncMock(),
    )
    service.usage = SimpleNamespace(
        get_subscription=AsyncMock(
            return_value=SimpleNamespace(
                usage_limits={
                    "documents": 0,
                    "storage_bytes": 100 * 1024 * 1024,
                }
            )
        ),
        increment=AsyncMock(),
    )
    service.audit = SimpleNamespace(record=AsyncMock())
    upload = ValidatedUpload(
        original_filename="report.pdf",
        safe_filename="report.pdf",
        extension=".pdf",
        content_type="application/pdf",
        content=b"%PDF-1.7\nok",
        checksum_sha256="b" * 64,
    )

    result = await service.upload(user_id, upload)

    assert result is document
    storage.upload.assert_awaited_once()
    session.refresh.assert_awaited_once_with(document)
    assert session.commit.await_count == 2
