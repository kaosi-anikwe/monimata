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
Interswitch API client.
Handles OAuth 2.0 client credentials token acquisition + caching in Redis,
and exposes the BVN lookup method used during onboarding.
"""

from __future__ import annotations

import base64
import logging
from typing import cast
from datetime import timedelta

import httpx

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

TOKEN_CACHE_KEY = "interswitch:access_token"
TOKEN_TTL_BUFFER_SECONDS = 60  # refresh token 60 s before it actually expires


class InterswitchClient:
    """
    Interswitch API client.
    Creates a fresh httpx.AsyncClient per call so it is safe to use from
    Celery tasks that each run in their own short-lived event loop.
    """

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=30.0)

    # ── OAuth token ───────────────────────────────────────────────────────────

    async def _get_access_token(self) -> str:
        r = get_redis()
        cached = cast(str | None, r.get(TOKEN_CACHE_KEY))
        if cached:
            return cached

        _credentials = base64.b64encode(
            f"{settings.INTERSWITCH_CLIENT_ID}:{settings.INTERSWITCH_CLIENT_SECRET}".encode()
        ).decode()
        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_PASSPORT_URL}/passport/oauth/token",
                headers={
                    "Authorization": f"Basic {_credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()
            data = response.json()

        access_token: str = data["access_token"]
        expires_in: int = int(data.get("expires_in", 3600))
        ttl = max(expires_in - TOKEN_TTL_BUFFER_SECONDS, 30)
        r.setex(TOKEN_CACHE_KEY, timedelta(seconds=ttl), access_token)
        return access_token

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    # ── BVN lookup ────────────────────────────────────────────────────────────

    async def lookup_bvn(self, bvn: str) -> dict:
        """
        Call Interswitch Passport to retrieve BVN holder details.
        Returns a dict with at least: first_name, last_name, date_of_birth.
        Raises httpx.HTTPStatusError on API failure.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_BASE_URL}/verify/identity/bvn/verify",
                headers=self._auth_headers(token),
                json={"id": bvn},
            )
            response.raise_for_status()
            return response.json()

    # ── Quickteller — biller discovery ───────────────────────────────────────

    async def get_biller_categories(self) -> list[dict]:
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{settings.INTERSWITCH_BASE_URL}/quickteller/api/v5/services/",
                headers=self._auth_headers(token),
            )
            response.raise_for_status()
            return response.json().get("BillerList", {}).get("Billers", [])

    async def get_billers_by_category(self, category_id: str) -> list[dict]:
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{settings.INTERSWITCH_BASE_URL}/quickteller/api/v5/services/{category_id}",
                headers=self._auth_headers(token),
            )
            response.raise_for_status()
            return response.json().get("BillerList", {}).get("Billers", [])

    async def validate_customer(self, biller_id: str, customer_id: str) -> dict:
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_BASE_URL}/quickteller/api/v5/services/customers",
                headers=self._auth_headers(token),
                json={"billerId": biller_id, "customerId": customer_id},
            )
            response.raise_for_status()
            return response.json()

    async def initiate_payment(self, payload: dict) -> dict:
        """
        Initiate a bill payment via Interswitch Quickteller.
        `payload` must include: requestReference, billerId, customerId, amount, etc.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_BASE_URL}/quickteller/api/v5/payments/requests",
                headers=self._auth_headers(token),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def query_payment_status(self, reference: str) -> dict:
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{settings.INTERSWITCH_BASE_URL}/quickteller/api/v5/payments/requests/{reference}",
                headers=self._auth_headers(token),
            )
            response.raise_for_status()
            return response.json()

    async def aclose(self) -> None:
        pass  # no persistent client to close


# Singleton — re-used across requests
interswitch_client = InterswitchClient()
