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
    # RS256 keys stored as base64-encoded PEM.
    # Generate with the snippet in docs/DEPLOYMENT.md §4.3.
    # Leave both empty to fall back to HS256 (development only).
    JWT_PRIVATE_KEY: str = ""  # base64-encoded PKCS8 private key
    JWT_PUBLIC_KEY: str = ""  # base64-encoded public key
    JWT_ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Fallback HS256 secret for development (used only when RS256 keys are absent)
    SECRET_KEY: str = "change-me-in-production"

    # ── AI / LLM ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Encryption ────────────────────────────────────────────────────────────
    # 32-byte (64-char hex) key for AES-256-GCM used on PII columns
    AES_ENCRYPTION_KEY: str = ""

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""  # Leave blank to disable Sentry
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2  # Fraction of transactions to trace

    # ── Email-worker webhook ──────────────────────────────────────────────────
    # Shared secret that the Cloudflare email-worker sends in X-MoniMata-Secret.
    BANK_ALERT_WEBHOOK_SECRET: str = ""

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
