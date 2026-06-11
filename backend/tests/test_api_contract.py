"""FastAPI route contract smoke tests."""

from uuid import uuid4

from app.main import app
from app.schemas.documents import Citation, SearchResult


def test_required_routes_are_exposed() -> None:
    routes = {(route.path, method) for route in app.routes for method in route.methods or []}
    required = {
        ("/api/v1/auth/register", "POST"),
        ("/api/v1/auth/login", "POST"),
        ("/api/v1/documents/upload", "POST"),
        ("/api/v1/chat", "POST"),
        ("/api/v1/conversations", "GET"),
        ("/api/v1/messages", "GET"),
    }
    assert required <= routes


def test_search_result_serializes_retrieval_citation() -> None:
    citation = Citation(
        reference="C1",
        document_id=uuid4(),
        document_name="example.pdf",
        page_number=1,
        chunk_id=uuid4(),
        chunk_index=0,
        score=0.91,
        excerpt="Grounded source text.",
    )

    result = SearchResult.model_validate(citation.model_dump())

    assert result.reference == "C1"
    assert result.score == 0.91
