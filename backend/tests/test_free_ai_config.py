"""Free local AI configuration tests."""

from app.core.config import Settings
from app.integrations.embeddings import OllamaEmbeddingProvider, build_embedding_service
from app.integrations.ollama import OllamaChatService


def test_default_ai_provider_requires_no_api_key() -> None:
    """Default settings must construct the local Ollama embedding provider."""
    settings = Settings()
    provider = build_embedding_service(settings)

    assert isinstance(provider, OllamaEmbeddingProvider)
    assert settings.embedding_model == "nomic-embed-text"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_chat_model == "llama3:latest"
    assert settings.ollama_request_timeout_seconds == 1200.0


def test_chat_requests_disable_hidden_reasoning_stream() -> None:
    """Grounded chat should stream visible answer tokens instead of hidden thinking tokens."""
    payload = OllamaChatService(Settings())._payload("system", "user", True)

    assert payload["think"] is False
    assert payload["keep_alive"] == "30m"
    assert payload["options"]["num_ctx"] == 2048
    assert payload["options"]["num_predict"] == 256

    long_payload = OllamaChatService(Settings())._payload(
        "system",
        "user",
        False,
        num_predict=2048,
        json_mode=True,
    )
    assert long_payload["options"]["num_predict"] == 2048
    assert long_payload["format"] == "json"
