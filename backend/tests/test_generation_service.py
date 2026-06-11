"""Document generation service tests."""

from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

from app.services.generation import DocumentGenerationService


class FakeLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        num_predict: int = 256,
        json_mode: bool = False,
    ) -> str:
        del system_prompt, user_prompt, num_predict
        assert json_mode is True
        start = self.calls * 10
        self.calls += 1
        return json.dumps(
            {
                "faqs": [
                    {
                        "question": f"Question {index}?",
                        "answer": f"Answer {index} [C1].",
                        "citations": ["C1"],
                    }
                    for index in range(start, start + 10)
                ]
            }
        )


class FakeUsage:
    def __init__(self) -> None:
        self.ai_requests = 0

    async def increment(self, user_id: object, *, ai_requests: int) -> None:
        del user_id
        self.ai_requests = ai_requests


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    async def commit(self) -> None:
        self.committed = True


async def test_faq_generation_collects_exactly_twenty_items() -> None:
    service = object.__new__(DocumentGenerationService)
    service.llm = FakeLLM()
    service.usage = FakeUsage()
    service.session = FakeSession()
    document_id = uuid4()
    document = SimpleNamespace(id=document_id, filename="example.pdf")
    chunks = [
        SimpleNamespace(
            id=uuid4(),
            chunk_text="Grounded document content.",
            page_number=1,
            chunk_index=0,
        )
    ]

    async def ready_document_chunks(user_id: object, requested_id: object) -> tuple[object, list]:
        del user_id
        assert requested_id == document_id
        return document, chunks

    service._ready_document_chunks = ready_document_chunks

    response = await service.faqs(uuid4(), document_id)

    assert len(response.faqs) == 20
    assert service.llm.calls == 1
    assert service.usage.ai_requests == 1
    assert service.session.committed is True


def test_faq_parser_normalizes_local_model_variations() -> None:
    items = DocumentGenerationService._parse_faq_items(
        {
            "questions": [
                {
                    "q": "Where did she study?",
                    "a": "She studied at Example Institute [C2].",
                    "citation": "[C2]",
                },
                {
                    "question": "What was her CGPA?",
                    "answer": "Her CGPA was 8.2 [C3].",
                    "citations": [3],
                },
                {"question": "", "answer": "Invalid"},
            ]
        }
    )

    assert len(items) == 2
    assert items[0].citations == ["C2"]
    assert items[1].citations == ["C3"]


def test_uncited_faq_is_matched_to_a_source_chunk() -> None:
    chunks = [
        SimpleNamespace(chunk_index=0, chunk_text="Java and SQL programming skills."),
        SimpleNamespace(chunk_index=1, chunk_text="Kalpataru Institute education history."),
    ]
    faq = DocumentGenerationService._ground_faq(
        SimpleNamespace(
            question="Which programming languages are listed?",
            answer="Java and SQL are listed.",
            citations=[],
        ),
        chunks,
    )

    assert faq.citations == ["C1"]
    assert faq.answer.endswith("[C1]")
