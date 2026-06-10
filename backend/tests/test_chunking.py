"""Chunking provenance tests."""

from app.services.chunking import DocumentChunker
from app.services.extraction import ExtractedSection


def test_chunks_preserve_page_numbers_and_overlap() -> None:
    text = " ".join(f"word-{index}" for index in range(300))
    chunks = DocumentChunker(chunk_size=200, chunk_overlap=50).split(
        [ExtractedSection(text=text, page_number=7, metadata={"heading": "Scope"})]
    )
    assert len(chunks) > 2
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk.page_number == 7 for chunk in chunks)
    assert all(chunk.chunk_metadata["heading"] == "Scope" for chunk in chunks)
