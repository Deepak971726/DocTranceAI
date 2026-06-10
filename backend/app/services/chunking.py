"""Page-aware recursive document chunking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.extraction import ExtractedSection


@dataclass(frozen=True, slots=True)
class TextChunk:
    """Chunk ready for relational and vector storage."""

    chunk_index: int
    page_number: int | None
    chunk_text: str
    token_count: int
    chunk_metadata: dict[str, Any]


class DocumentChunker:
    """Recursive splitter preserving page/heading provenance."""

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150) -> None:
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def split(self, sections: list[ExtractedSection]) -> list[TextChunk]:
        """Split each source section independently so citations remain precise."""
        chunks: list[TextChunk] = []
        for section in sections:
            for text in self.splitter.split_text(section.text):
                clean_text = text.strip()
                if not clean_text:
                    continue
                chunks.append(
                    TextChunk(
                        chunk_index=len(chunks),
                        page_number=section.page_number,
                        chunk_text=clean_text,
                        token_count=max(1, len(clean_text) // 4),
                        chunk_metadata=section.metadata,
                    )
                )
        return chunks
