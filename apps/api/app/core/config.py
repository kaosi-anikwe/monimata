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

from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── Core ──────────────────────────────────────────────────────────────────
    # Empty default allows construction without args; validator below enforces
    # that the value is set via the .env file or environment variable at runtime.
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8081"]

    # ── JWT ───────────────────────────────────────────────────────────────────
    # The public engine only needs the PUBLIC KEY to verify tokens.
    # The private key lives exclusively on console.monimata.ng.
    JWT_PUBLIC_KEY: str = ""  # base64-encoded public key
    JWT_ALGORITHM: str = "RS256"

    # HS256 fallback for development (used only when RS256 public key is absent)
    SECRET_KEY: str = "change-me-in-production"

    # ── AI / LLM ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Encryption ────────────────────────────────────────────────────────────
    # 32-byte (64-char hex) key for AES-256-GCM used on PII columns
    AES_ENCRYPTION_KEY: str = ""
    # Fernet key for BYOK AI API keys stored in UserAiCredential.
    # Generate:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    FERNET_KEY: str = ""

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""  # Leave blank to disable Sentry
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2  # Fraction of transactions to trace

    # ── Email-worker webhook ──────────────────────────────────────────────────
    # Shared secret that the Cloudflare email-worker sends in X-MoniMata-Secret.
    BANK_ALERT_WEBHOOK_SECRET: str = ""

    # ── Outbound SMTP ─────────────────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # e.g. "MoniMata <no-reply@moni-mata.ng>"
    SMTP_USE_TLS: bool = True  # STARTTLS on port 587; set False for SSL-only (port 465)

    # ── Environment ───────────────────────────────────────────────────────────
    ENV: str = "development"  # "development" | "production"

    # ── Client version enforcement ────────────────────────────────────────────
    # Minimum mobile app version allowed to call the API.
    # Leave empty (or "0.0.0") to disable enforcement.
    # When set, requests missing X-App-Version are also rejected.
    MIN_APP_VERSION: str = ""  # e.g. "0.4.0"
    # Store deep-links sent in 426 responses (one per platform).
    APP_UPDATE_URL_ANDROID: str = ""  # Play Store URL
    APP_UPDATE_URL_IOS: str = ""  # App Store URL

    # ── Sanity Content Lake ───────────────────────────────────────────────────
    SANITY_PROJECT_ID: str = ""
    SANITY_DATASET: str = "production"
    SANITY_API_VERSION: str = "2024-01-01"
    # Read token — only required if the dataset is private.
    SANITY_API_TOKEN: str = ""

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"  # DEBUG | INFO | WARNING | ERROR
    LOG_DIR: str = "logs"  # relative to the working directory (apps/api)

    @model_validator(mode="after")
    def _require_database_url(self) -> Settings:
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must be set via .env or the DATABASE_URL environment variable"
            )
        return self


settings = Settings()
