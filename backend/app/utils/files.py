"""Upload validation and filename hardening."""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.exceptions import ValidationError

ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}
EXECUTABLE_SIGNATURES = (b"MZ", b"\x7fELF", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe")


@dataclass(frozen=True, slots=True)
class ValidatedUpload:
    """Fully read and validated upload."""

    original_filename: str
    safe_filename: str
    extension: str
    content_type: str
    content: bytes
    checksum_sha256: str


def sanitize_filename(filename: str) -> str:
    """Remove paths and unsafe characters while retaining a readable name."""
    name = Path(filename).name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).stem).strip("._")
    suffix = Path(name).suffix.lower()
    if not stem:
        stem = "document"
    return f"{stem[:180]}{suffix}"


def _validate_docx(content: bytes) -> None:
    """Reject malformed DOCX containers and suspicious decompression ratios."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise ValidationError("The DOCX container is invalid.")
            total_uncompressed = sum(item.file_size for item in archive.infolist())
            total_compressed = max(1, sum(item.compress_size for item in archive.infolist()))
            unsafe_size = total_uncompressed > 100 * 1024 * 1024
            unsafe_ratio = total_uncompressed / total_compressed > 100
            if unsafe_size or unsafe_ratio:
                raise ValidationError("The DOCX archive has an unsafe compression ratio.")
    except zipfile.BadZipFile as exc:
        raise ValidationError("The DOCX file is corrupted.") from exc


def validate_file_content(extension: str, content: bytes) -> None:
    """Validate magic bytes and reject executable/polyglot indicators."""
    if not content:
        raise ValidationError("The uploaded file is empty.")
    if content.startswith(EXECUTABLE_SIGNATURES):
        raise ValidationError("Executable files are not allowed.")
    if extension == ".pdf" and not content.lstrip().startswith(b"%PDF-"):
        raise ValidationError("The file content is not a valid PDF.")
    if extension == ".docx":
        _validate_docx(content)
    if extension == ".txt":
        if b"\x00" in content:
            raise ValidationError("Binary content is not allowed in TXT files.")
        try:
            content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError("TXT files must use UTF-8 encoding.") from exc


async def read_and_validate_upload(
    upload: UploadFile,
    *,
    max_bytes: int,
) -> ValidatedUpload:
    """Read an upload in bounded chunks and validate its declared and actual type."""
    original = upload.filename or "document"
    safe_name = sanitize_filename(original)
    extension = Path(safe_name).suffix.lower()
    expected_type = ALLOWED_TYPES.get(extension)
    if expected_type is None:
        raise ValidationError("Only PDF, DOCX, and TXT files are supported.")
    accepted_declared_types = {expected_type, "application/octet-stream"}
    if upload.content_type and upload.content_type not in accepted_declared_types:
        raise ValidationError("The declared file type does not match its extension.")
    buffer = bytearray()
    while chunk := await upload.read(1024 * 1024):
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise ValidationError(f"File exceeds the {max_bytes} byte upload limit.")
    content = bytes(buffer)
    validate_file_content(extension, content)
    return ValidatedUpload(
        original_filename=original[:255],
        safe_filename=safe_name,
        extension=extension,
        content_type=expected_type,
        content=content,
        checksum_sha256=hashlib.sha256(content).hexdigest(),
    )
