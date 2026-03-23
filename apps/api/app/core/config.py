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

from typing import List
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Core ──────────────────────────────────────────────────────────────────
    # Empty default allows construction without args; validator below enforces
    # that the value is set via the .env file or environment variable at runtime.
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8081"]

    # ── JWT ───────────────────────────────────────────────────────────────────
    # RS256 keys — generate with: openssl genrsa -out private.pem 2048
    #              openssl rsa -in private.pem -pubout -out public.pem
    JWT_PRIVATE_KEY: str = ""
    JWT_PUBLIC_KEY: str = ""
    JWT_ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Fallback HS256 secret for development (used only when RS256 keys are absent)
    SECRET_KEY: str = "change-me-in-production"

    # ── Mono ──────────────────────────────────────────────────────────────────
    MONO_SECRET_KEY: str = ""
    MONO_WEBHOOK_SECRET: str = ""
    MONO_BASE_URL: str = "https://api.withmono.com"

    # ── Interswitch ───────────────────────────────────────────────────────────
    INTERSWITCH_CLIENT_ID: str = ""
    INTERSWITCH_CLIENT_SECRET: str = ""
    INTERSWITCH_ENV: str = "sandbox"  # "sandbox" | "production"

    @property
    def INTERSWITCH_BASE_URL(self) -> str:
        if self.INTERSWITCH_ENV == "production":
            return "https://api.interswitchng.com"
        return "https://sandbox.interswitchng.com"

    @property
    def INTERSWITCH_PASSPORT_URL(self) -> str:
        if self.INTERSWITCH_ENV == "production":
            return "https://passport.interswitchng.com"
        return "https://sandbox.interswitchng.com"

    # ── AI / LLM ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Notifications ─────────────────────────────────────────────────────────
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""

    # ── Encryption ────────────────────────────────────────────────────────────
    # 32-byte (64-char hex) key for AES-256-GCM used on PII columns
    AES_ENCRYPTION_KEY: str = ""

    @model_validator(mode="after")
    def _require_database_url(self) -> "Settings":
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must be set via .env or the DATABASE_URL environment variable"
            )
        return self


settings = Settings()
