"""Ollama chat generation and newline-delimited JSON streaming."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.core.config import Settings
from app.core.logging import get_logger
from app.exceptions import AIServiceError

logger = get_logger(__name__)


class OllamaChatService:
    """Grounded text generation through Ollama's `/api/chat` endpoint."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def model_name(self) -> str:
        """Return the configured model name."""
        return self.settings.ollama_chat_model

    def _payload(self, system_prompt: str, user_prompt: str, stream: bool) -> dict[str, object]:
        return {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": stream,
            "options": {"temperature": 0.1, "top_p": 0.9},
        }

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Generate one complete answer."""
        logger.info(
            "ollama_generate_started — sending prompt to LLM",
            model=self.model_name,
            prompt_chars=len(user_prompt),
        )
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url.rstrip('/')}/api/chat",
                    json=self._payload(system_prompt, user_prompt, False),
                )
                response.raise_for_status()
                content = response.json().get("message", {}).get("content", "")
        except (httpx.HTTPError, ValueError) as exc:
            logger.exception(
                "ollama_generate_failed — LLM did not respond",
                model=self.model_name,
            )
            raise AIServiceError("Answer generation failed.") from exc
        if not content.strip():
            raise AIServiceError("The language model returned an empty response.")
        logger.info(
            "ollama_generate_completed",
            model=self.model_name,
            response_chars=len(content),
        )
        return str(content).strip()

    async def stream(self, system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
        """Yield assistant content fragments from Ollama NDJSON."""
        logger.info(
            "ollama_stream_started — opening SSE connection to LLM",
            model=self.model_name,
            prompt_chars=len(user_prompt),
        )
        token_count = 0
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.settings.ollama_base_url.rstrip('/')}/api/chat",
                    json=self._payload(system_prompt, user_prompt, True),
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        payload = json.loads(line)
                        content = payload.get("message", {}).get("content")
                        if content:
                            token_count += 1
                            yield str(content)
        except (httpx.HTTPError, ValueError, json.JSONDecodeError) as exc:
            logger.exception(
                "ollama_stream_failed — stream interrupted",
                model=self.model_name,
                tokens_yielded=token_count,
            )
            raise AIServiceError("Streaming answer generation failed.") from exc
        logger.info(
            "ollama_stream_completed",
            model=self.model_name,
            tokens_yielded=token_count,
        )
