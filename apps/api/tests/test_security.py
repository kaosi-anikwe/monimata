"""Tests for core security utilities."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.config import settings


class TestAesPiiEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        from app.core.security import decrypt_pii, encrypt_pii

        plaintext = "0123456789"
        encrypted = encrypt_pii(plaintext)
        assert encrypted != plaintext
        decrypted = decrypt_pii(encrypted)
        assert decrypted == plaintext

    def test_different_encryptions_differ(self):
        from app.core.security import encrypt_pii

        e1 = encrypt_pii("0123456789")
        e2 = encrypt_pii("0123456789")
        # Different random nonces → different ciphertexts
        assert e1 != e2


class TestJwtDecode:
    def test_decode_valid_hs256_token(self):
        from jose import jwt

        from app.core.security import decode_access_token

        # Use HS256 fallback (no public key set)
        token = jwt.encode(
            {"sub": "user-123", "exp": 9999999999, "type": "access"},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        with patch.object(settings, "JWT_PUBLIC_KEY", ""):
            payload = decode_access_token(token)
        assert payload["sub"] == "user-123"

    def test_decode_expired_token_raises(self):
        from jose import JWTError, jwt

        from app.core.security import decode_access_token

        token = jwt.encode(
            {"sub": "user-123", "exp": 1000000000, "type": "access"},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        with pytest.raises(JWTError):
            decode_access_token(token)

    def test_non_access_token_raises(self):
        from jose import JWTError, jwt

        from app.core.security import decode_access_token

        token = jwt.encode(
            {"sub": "user-123", "exp": 9999999999, "type": "refresh"},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        with patch.object(settings, "JWT_PUBLIC_KEY", ""):
            with pytest.raises(JWTError, match="Not an access token"):
                decode_access_token(token)

    def test_missing_sub_returns_no_sub(self):
        """Token without 'sub' decodes but payload has no 'sub' key."""
        from jose import jwt

        from app.core.security import decode_access_token

        token = jwt.encode(
            {"exp": 9999999999, "type": "access"},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        with patch.object(settings, "JWT_PUBLIC_KEY", ""):
            payload = decode_access_token(token)
            assert "sub" not in payload


class TestFernetEncryption:
    def test_encrypt_decrypt_api_key(self):
        from cryptography.fernet import Fernet

        # Generate a real Fernet key for testing
        real_key = Fernet.generate_key().decode()

        with patch.object(settings, "FERNET_KEY", real_key):
            from app.core.security import decrypt_api_key, encrypt_api_key

            plaintext = "sk-test-api-key-12345"
            encrypted = encrypt_api_key(plaintext)
            assert encrypted != plaintext
            decrypted = decrypt_api_key(encrypted)
            assert decrypted == plaintext


class TestCurrentUserDep:
    def test_valid_token_returns_user(self):
        from jose import jwt

        from app.core.deps import get_current_user

        token = jwt.encode(
            {"sub": "user-abc", "usr": "testuser", "exp": 9999999999, "type": "access"},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        from unittest.mock import MagicMock

        creds = MagicMock()
        creds.credentials = token
        with patch.object(settings, "JWT_PUBLIC_KEY", ""):
            user = get_current_user(creds)
        assert user.id == "user-abc"
        assert user.username == "testuser"

    def test_invalid_token_raises_401(self):
        from unittest.mock import MagicMock

        from fastapi import HTTPException

        from app.core.deps import get_current_user

        creds = MagicMock()
        creds.credentials = "invalid-token"
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(creds)
        assert exc_info.value.status_code == 401
