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
WebSocket event dispatch.

Architecture: Redis pub/sub (recommended for multi-worker deployments).

To emit an event, Celery tasks and sync FastAPI handlers call notify_user(),
which publishes a JSON message to the channel  user:{user_id}:events.

The WebSocket endpoint (routers/ws.py) opens an async Redis pubsub
subscription on that channel for each connected client and forwards every
message to the WebSocket.  A single user can hold multiple simultaneous
connections (phone + tablet + web) — each connection gets its own pubsub
subscription, so all connections receive the event.

Usage from any context (sync or async):

    from app.ws_manager import notify_user

    # Inside a Celery task:
    notify_user(user_id, ["transactions", "nudges"])

    # Inside a sync FastAPI handler (POST /sync/push):
    notify_user(current_user.id, ["budget", "transactions"])

    # Inside an async Celery task / async FastAPI handler:
    await async_notify_user(user_id, ["accounts", "transactions"])
"""

from __future__ import annotations

import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Channel naming ─────────────────────────────────────────────────────────────


def ws_channel(user_id: str) -> str:
    """Return the canonical Redis pub/sub channel name for a user."""
    return f"user:{user_id}:events"


# ── Synchronous publish (Celery workers, sync FastAPI handlers) ───────────────


def notify_user(user_id: str, keys: list[str]) -> None:
    """
    Publish an invalidate event to all of a user's active WebSocket connections.

    Safe to call from synchronous Celery tasks and sync FastAPI route handlers.
    Failures are logged and swallowed — never raises to the caller so a Redis
    blip never breaks transaction processing.
    """
    from app.core.redis_client import get_redis

    try:
        r = get_redis()
        payload = json.dumps({"type": "invalidate", "keys": keys})
        r.publish(ws_channel(user_id), payload)
        logger.debug("notify_user user=%s keys=%s", user_id, keys)
    except Exception:
        logger.exception(
            "notify_user: Redis publish failed for user=%s keys=%s", user_id, keys
        )


# ── Asynchronous publish (async FastAPI handlers, async tasks) ────────────────


async def async_notify_user(user_id: str, keys: list[str]) -> None:
    """
    Async version of notify_user for use inside async FastAPI handlers or
    async Celery tasks.  Creates a short-lived async Redis connection.
    """
    import redis.asyncio as aioredis  # redis-py >= 4.x

    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        payload = json.dumps({"type": "invalidate", "keys": keys})
        await r.publish(ws_channel(user_id), payload)
        await r.aclose()
        logger.debug("async_notify_user user=%s keys=%s", user_id, keys)
    except Exception:
        logger.exception(
            "async_notify_user: Redis publish failed for user=%s keys=%s",
            user_id,
            keys,
        )
