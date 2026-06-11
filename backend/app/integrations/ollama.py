"""Ollama chat generation and newline-delimited JSON streaming."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.core.config import Settings
from app.core.logging import (
    get_logger,
    log_process_failed,
    log_process_finished,
    log_process_started,
)
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

    def _payload(
        self,
        system_prompt: str,
        user_prompt: str,
        stream: bool,
        *,
        num_predict: int = 256,
        json_mode: bool = False,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": stream,
            "think": False,
            "keep_alive": self.settings.ollama_keep_alive,
            "options": {
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": num_predict,
                "num_ctx": self.settings.ollama_context_tokens,
            },
        }
        if json_mode:
            payload["format"] = "json"
        return payload

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        num_predict: int = 256,
        json_mode: bool = False,
    ) -> str:
        """Generate one complete answer."""
        log_process_started(
            logger,
            "LLM generation",
            model=self.model_name,
            prompt_chars=len(user_prompt),
            json_mode=json_mode,
            max_tokens=num_predict,
        )
        logger.info(
            "ollama_generate_started - sending prompt to LLM",
            model=self.model_name,
            prompt_chars=len(user_prompt),
        )
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.ollama_request_timeout_seconds
            ) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url.rstrip('/')}/api/chat",
                    json=self._payload(
                        system_prompt,
                        user_prompt,
                        False,
                        num_predict=num_predict,
                        json_mode=json_mode,
                    ),
                )
                response.raise_for_status()
                content = response.json().get("message", {}).get("content", "")
        except (httpx.HTTPError, ValueError) as exc:
            log_process_failed(
                logger,
                "LLM generation",
                model=self.model_name,
                json_mode=json_mode,
            )
            logger.exception(
                "ollama_generate_failed - LLM did not respond",
                model=self.model_name,
            )
            raise AIServiceError("Answer generation failed.") from exc
        if not content.strip():
            log_process_failed(
                logger,
                "LLM generation",
                model=self.model_name,
                json_mode=json_mode,
                reason="empty_response",
            )
            raise AIServiceError("The language model returned an empty response.")
        log_process_finished(
            logger,
            "LLM generation",
            model=self.model_name,
            response_chars=len(content),
            json_mode=json_mode,
        )
        logger.info(
            "ollama_generate_completed",
            model=self.model_name,
            response_chars=len(content),
        )
        return str(content).strip()

    async def stream(self, system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
        """Yield assistant content fragments from Ollama NDJSON."""
        log_process_started(
            logger,
            "LLM streaming generation",
            model=self.model_name,
            prompt_chars=len(user_prompt),
        )
        logger.info(
            "ollama_stream_started - opening SSE connection to LLM",
            model=self.model_name,
            prompt_chars=len(user_prompt),
        )
        token_count = 0
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.ollama_request_timeout_seconds
            ) as client:
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
            log_process_failed(
                logger,
                "LLM streaming generation",
                model=self.model_name,
                tokens_yielded=token_count,
            )
            logger.exception(
                "ollama_stream_failed - stream interrupted",
                model=self.model_name,
                tokens_yielded=token_count,
            )
            raise AIServiceError("Streaming answer generation failed.") from exc
        log_process_finished(
            logger,
            "LLM streaming generation",
            model=self.model_name,
            tokens_yielded=token_count,
        )
        logger.info(
            "ollama_stream_completed",
            model=self.model_name,
            tokens_yielded=token_count,
        )
