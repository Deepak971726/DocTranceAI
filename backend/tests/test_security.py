"""Security primitive tests."""

from uuid import uuid4

import pytest

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.exceptions import AuthenticationError


def test_password_hash_round_trip() -> None:
    password = "Strong!Password123"
    digest = hash_password(password)
    assert digest != password
    assert verify_password(password, digest)
    assert not verify_password("wrong-password", digest)


def test_access_token_has_enforced_type() -> None:
    settings = Settings(jwt_secret_key="x" * 40)
    user_id = uuid4()
    token = create_access_token(user_id, 3, settings)
    payload = decode_token(token, "access", settings)
    assert payload["sub"] == str(user_id)
    assert payload["ver"] == 3
    with pytest.raises(AuthenticationError):
        decode_token(token, "refresh", settings)


def test_token_hash_is_stable_and_not_plaintext() -> None:
    assert hash_token("secret") == hash_token("secret")
    assert hash_token("secret") != "secret"
