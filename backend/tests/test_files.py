"""Document validation tests."""

import io
import zipfile

import pytest

from app.exceptions import ValidationError
from app.utils.files import sanitize_filename, validate_file_content


def test_filename_is_reduced_to_safe_basename() -> None:
    assert sanitize_filename("../../Client Contract (final).PDF") == "Client_Contract_final.pdf"


def test_pdf_magic_is_required() -> None:
    validate_file_content(".pdf", b"%PDF-1.7\ncontent")
    with pytest.raises(ValidationError):
        validate_file_content(".pdf", b"not a pdf")


def test_docx_container_members_are_required() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<document/>")
    validate_file_content(".docx", buffer.getvalue())
    with pytest.raises(ValidationError):
        validate_file_content(".docx", b"PK-not-a-valid-archive")


def test_txt_rejects_binary_content() -> None:
    validate_file_content(".txt", b"Readable UTF-8 text")
    with pytest.raises(ValidationError):
        validate_file_content(".txt", b"text\x00binary")
