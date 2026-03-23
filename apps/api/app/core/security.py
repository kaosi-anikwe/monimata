# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
Security utilities:
  - Password hashing (bcrypt, cost 12)
  - JWT creation / verification (RS256 preferred; HS256 fallback for dev)
  - AES-256-GCM encryption for PII columns (account numbers)
  - Refresh token generation
"""

from __future__ import annotations

import os
import base64
import secrets
from typing import Any
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
import bcrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_BCRYPT_ROUNDS = 12

# ── Password ──────────────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ───────────────────────────────────────────────────────────────────────


def _jwt_encode_key() -> str | dict:
    """Return the signing key. RS256 preferred; falls back to HS256 secret."""
    if settings.JWT_PRIVATE_KEY:
        return settings.JWT_PRIVATE_KEY
    return settings.SECRET_KEY


def _jwt_decode_key() -> str | dict:
    if settings.JWT_PUBLIC_KEY:
        return settings.JWT_PUBLIC_KEY
    return settings.SECRET_KEY


def _jwt_algorithm() -> str:
    return "RS256" if settings.JWT_PRIVATE_KEY else "HS256"


def create_access_token(
    subject: str, extra_claims: dict[str, Any] | None = None
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _jwt_encode_key(), algorithm=_jwt_algorithm())


def create_refresh_token() -> str:
    """Return a cryptographically random opaque refresh token (64 bytes → 128 hex chars)."""
    return secrets.token_hex(64)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and verify an access token.
    Raises jose.JWTError on any failure (expired, invalid signature, etc.).
    """
    payload = jwt.decode(
        token,
        _jwt_decode_key(),
        algorithms=[_jwt_algorithm()],
        options={"require": ["sub", "exp", "type"]},
    )
    if payload.get("type") != "access":
        raise JWTError("Not an access token")
    return payload


# ── AES-256-GCM PII encryption ────────────────────────────────────────────────


def _aes_key() -> bytes:
    """Return the 32-byte AES key from config (stored as 64-char hex string)."""
    key_hex = settings.AES_ENCRYPTION_KEY
    if not key_hex or len(key_hex) < 64:
        raise RuntimeError(
            "AES_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
        )
    return bytes.fromhex(key_hex[:64])


def encrypt_pii(plaintext: str) -> str:
    """
    Encrypt a PII string with AES-256-GCM.
    Output: base64-encoded  nonce(12) + ciphertext + tag(16)
    """
    key = _aes_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)  # ct includes 16-byte tag
    return base64.b64encode(nonce + ct).decode()


def decrypt_pii(blob: str) -> str:
    """Decrypt a value produced by encrypt_pii."""
    key = _aes_key()
    raw = base64.b64decode(blob)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()
