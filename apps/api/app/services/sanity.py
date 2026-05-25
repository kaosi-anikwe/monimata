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
Sanity Content Lake client.

Uses the Sanity GROQ HTTP API — no third-party SDK required.
All queries go through ``groq_query()``, which returns the raw
``result`` value from Sanity's response envelope.
"""

from __future__ import annotations

import json
import urllib.parse
from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = httpx.Timeout(10.0)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_TIMEOUT)
    return _client


def _sanity_url() -> str:
    return (
        f"https://{settings.SANITY_PROJECT_ID}.api.sanity.io"
        f"/v{settings.SANITY_API_VERSION}"
        f"/data/query/{settings.SANITY_DATASET}"
    )


def _headers() -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if settings.SANITY_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.SANITY_API_TOKEN}"
    return headers


async def groq_query(query: str, params: dict[str, Any] | None = None) -> Any:
    """Execute a GROQ query and return the ``result`` payload."""
    qs: dict[str, str] = {"query": query}
    if params:
        # Sanity expects GROQ params prefixed with "$" in the query string.
        for key, value in params.items():
            param_key = key if key.startswith("$") else f"${key}"
            qs[param_key] = json.dumps(value)

    url = f"{_sanity_url()}?{urllib.parse.urlencode(qs)}"

    response = await _get_client().get(url, headers=_headers())
    response.raise_for_status()
    data = response.json()
    return data.get("result")
