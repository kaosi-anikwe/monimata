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
Redis client helper.
Provides a single shared Redis connection used for:
  - Refresh token storage
  - Interswitch access token cache
  - Celery broker (via Celery's own connection)
"""

from typing import cast
from datetime import timedelta

import redis

from app.core.config import settings

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(  # type: ignore[assignment]
            settings.REDIS_URL, decode_responses=True
        )
    return _redis_client


# ── Refresh token helpers ─────────────────────────────────────────────────────

REFRESH_TOKEN_PREFIX = "refresh_token:"


def store_refresh_token(user_id: str, token: str) -> None:
    """Store refresh token keyed by user_id *and* a reverse-lookup key by token value."""
    r = get_redis()
    ttl = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    r.setex(f"{REFRESH_TOKEN_PREFIX}{user_id}", ttl, token)
    r.setex(f"rt_reverse:{token}", ttl, user_id)


def get_stored_refresh_token(user_id: str) -> str | None:
    r = get_redis()
    return cast(str | None, r.get(f"{REFRESH_TOKEN_PREFIX}{user_id}"))


def delete_refresh_token(user_id: str) -> None:
    r = get_redis()
    # Remove the reverse key as well
    token = r.get(f"{REFRESH_TOKEN_PREFIX}{user_id}")
    if token:
        r.delete(f"rt_reverse:{token}")
    r.delete(f"{REFRESH_TOKEN_PREFIX}{user_id}")


# ── JWT access-token blocklist ────────────────────────────────────────────────
# On logout the current access token's jti is written here with a TTL equal to
# the token's remaining lifetime.  decode_access_token checks this before
# accepting a token.  This closes the window where a stolen access token could
# still be used after the owning user logs out.

_BLOCKLIST_PREFIX = "jti_blocklist:"


def blocklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token jti to the blocklist until it naturally expires."""
    if ttl_seconds > 0:
        get_redis().setex(f"{_BLOCKLIST_PREFIX}{jti}", ttl_seconds, "1")


def is_token_blocklisted(jti: str) -> bool:
    return int(get_redis().exists(f"{_BLOCKLIST_PREFIX}{jti}")) > 0  # type: ignore[arg-type]


# ── Per-user rate limiter ─────────────────────────────────────────────────────


def check_rate_limit(
    user_id: str, action: str, limit: int, window_seconds: int
) -> bool:
    """
    Sliding-window rate limiter backed by a Redis counter.

    Returns True when the request is within the limit, False when it exceeds it.
    Uses a simple fixed-window approach: INCR + EXPIRE on the first hit in
    each window.  This is O(1) and has no race conditions for the expiry path
    because INCR is atomic.

    Args:
        user_id:        The authenticated user's ID.
        action:         A short string identifying the endpoint, e.g. "sync_push".
        limit:          Maximum allowed requests in the window.
        window_seconds: Window length in seconds.
    """
    r = get_redis()
    key = f"rl:{action}:{user_id}"
    count = int(r.incr(key))  # type: ignore[arg-type]
    if count == 1:
        # First request in this window — set the expiry.
        r.expire(key, window_seconds)
    return count <= limit
