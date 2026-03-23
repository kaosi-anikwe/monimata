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
Mono API client — account linking, transaction fetching, HMAC webhook verification.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def verify_mono_webhook(request_body: bytes, signature_header: str) -> bool:
    """
    Verify the HMAC-SHA512 signature sent by Mono on every webhook call.
    Returns True only when the signature is valid.
    CRITICAL: Always reject webhooks that fail this check.
    """
    expected = hmac.new(
        settings.MONO_WEBHOOK_SECRET.encode(),
        request_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


class MonoClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=settings.MONO_BASE_URL,
            headers={
                "mono-sec-key": settings.MONO_SECRET_KEY,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def exchange_auth_code(self, code: str) -> dict:
        """Exchange a one-time auth_code from Mono Connect SDK for an account id."""
        response = await self._http.post("/account/auth", json={"code": code})
        response.raise_for_status()
        return response.json()

    async def get_account(self, mono_account_id: str) -> dict:
        response = await self._http.get(f"/accounts/{mono_account_id}")
        response.raise_for_status()
        return response.json()

    async def get_transactions(
        self,
        mono_account_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict]:
        """
        Fetch all transaction pages for an account.
        Uses pagination — keeps fetching until no next page.
        """
        params: dict[str, str] = {"paginate": "true"}
        if start:
            params["start"] = start.strftime("%d-%m-%Y")
        if end:
            params["end"] = end.strftime("%d-%m-%Y")

        transactions: list[dict] = []
        page = 1

        while True:
            params["page"] = str(page)
            response = await self._http.get(
                f"/accounts/{mono_account_id}/transactions",
                params=params,
            )
            response.raise_for_status()
            data = response.json()

            page_txns = data.get("data", [])
            transactions.extend(page_txns)

            # Mono returns `paginatedData` with a `next` cursor or total pages
            paginated = data.get("paginatedData", {})
            total_pages = paginated.get("totalPages", 1)
            if page >= total_pages or not page_txns:
                break
            page += 1

        return transactions

    async def trigger_sync(self, mono_account_id: str) -> dict:
        """Trigger an immediate re-sync on Mono's side (manual sync)."""
        response = await self._http.post(f"/accounts/{mono_account_id}/sync")
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self._http.aclose()


mono_client = MonoClient()
