"""FastAPI route contract smoke tests."""

from app.main import app


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
