"""Free local AI configuration tests."""

from app.core.config import Settings
from app.integrations.embeddings import OllamaEmbeddingProvider, build_embedding_service


def test_default_ai_provider_requires_no_api_key() -> None:
    """Default settings must construct the local Ollama embedding provider."""
    settings = Settings()
    provider = build_embedding_service(settings)

    assert isinstance(provider, OllamaEmbeddingProvider)
    assert settings.embedding_model == "nomic-embed-text"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_chat_model == "qwen3:4b"
