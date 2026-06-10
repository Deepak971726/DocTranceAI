"""PDF, DOCX, and TXT extraction with page-aware source sections."""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import fitz
from docx import Document as DocxDocument

from app.exceptions import ValidationError


@dataclass(frozen=True, slots=True)
class ExtractedSection:
    """One extraction unit retaining source location."""

    text: str
    page_number: int | None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ExtractionResult:
    """Normalized extraction output."""

    sections: list[ExtractedSection]
    page_count: int | None
    metadata: dict[str, Any]


def extract_pdf(content: bytes) -> ExtractionResult:
    """Extract text and metadata from every PDF page using PyMuPDF."""
    try:
        with fitz.open(stream=content, filetype="pdf") as pdf:
            metadata = {key: value for key, value in (pdf.metadata or {}).items() if value}
            sections = [
                ExtractedSection(
                    text=page.get_text("text").strip(),
                    page_number=index + 1,
                    metadata={"page": index + 1},
                )
                for index, page in enumerate(pdf)
                if page.get_text("text").strip()
            ]
            return ExtractionResult(
                sections=sections,
                page_count=pdf.page_count,
                metadata=metadata,
            )
    except Exception as exc:
        raise ValidationError("PDF text extraction failed.") from exc


def extract_docx(content: bytes) -> ExtractionResult:
    """Extract headings, paragraphs, and core properties from DOCX."""
    try:
        document = DocxDocument(io.BytesIO(content))
    except Exception as exc:
        raise ValidationError("DOCX text extraction failed.") from exc
    sections: list[ExtractedSection] = []
    current_heading: str | None = None
    paragraph_buffer: list[str] = []

    def flush() -> None:
        if paragraph_buffer:
            text = "\n".join(paragraph_buffer).strip()
            if text:
                sections.append(
                    ExtractedSection(
                        text=text,
                        page_number=None,
                        metadata={"heading": current_heading} if current_heading else {},
                    )
                )
            paragraph_buffer.clear()

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        if paragraph.style and paragraph.style.name.lower().startswith("heading"):
            flush()
            current_heading = text
            paragraph_buffer.append(text)
        else:
            paragraph_buffer.append(text)
    flush()
    properties = document.core_properties
    metadata = {
        key: value
        for key, value in {
            "title": properties.title,
            "subject": properties.subject,
            "author": properties.author,
            "keywords": properties.keywords,
            "category": properties.category,
        }.items()
        if value
    }
    return ExtractionResult(sections=sections, page_count=None, metadata=metadata)


def extract_txt(content: bytes) -> ExtractionResult:
    """Decode UTF-8 plain text."""
    text = content.decode("utf-8-sig").strip()
    return ExtractionResult(
        sections=[ExtractedSection(text=text, page_number=None)] if text else [],
        page_count=None,
        metadata={},
    )


def extract_document(filename: str, content: bytes) -> ExtractionResult:
    """Route extraction by the already validated extension."""
    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        result = extract_pdf(content)
    elif extension == ".docx":
        result = extract_docx(content)
    elif extension == ".txt":
        result = extract_txt(content)
    else:
        raise ValidationError("Unsupported document type.")
    if not result.sections:
        raise ValidationError(
            "No extractable text was found. Scanned PDFs require a separate OCR pipeline."
        )
    return result
