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
Centralised slowapi rate-limiter instance.

Key function strategy
─────────────────────
Authenticated requests are limited per-user (extracted from the JWT `sub`
claim) so every user gets their own quota, regardless of shared IPs (NAT,
mobile carriers, etc.).  Unauthenticated requests fall back to the client
IP address.

Endpoints that are always unauthenticated (login, register, forgot-password,
etc.) should pass ``key_func=get_remote_address`` explicitly to the
``@limiter.limit()`` decorator so the per-IP limit applies unconditionally —
no JWT decode is attempted for those routes.

Default global limit
────────────────────
200 requests / minute applies to every route that has no ``@limiter.limit()``
decorator.  Sensitive endpoints declare a tighter limit directly on the
handler function.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _get_user_or_ip(request: Request) -> str:
    """
    Return a rate-limit key that identifies the caller.

    Priority:
      1. ``user:<uuid>``  — when a valid Bearer token is present.
      2. Client IP        — fallback for unauthenticated or invalid tokens.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        try:
            # Lazy import to avoid a circular dependency during app startup.
            from app.core.security import decode_access_token

            payload = decode_access_token(token)
            return f"user:{payload['sub']}"
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(
    key_func=_get_user_or_ip,
    default_limits=["200/minute"],
    storage_uri=settings.REDIS_URL,
)
