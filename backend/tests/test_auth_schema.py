"""Authentication schema validation tests."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest, ResetPasswordRequest


def test_six_character_password_is_accepted() -> None:
    registration = RegisterRequest(
        email="person@example.com",
        password="Ab1!xy",
        full_name="Person",
    )
    reset = ResetPasswordRequest(token="x" * 32, password="Ab1!xy")

    assert registration.password == "Ab1!xy"
    assert reset.password == "Ab1!xy"


def test_password_shorter_than_six_characters_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="person@example.com", password="A1!xy")
