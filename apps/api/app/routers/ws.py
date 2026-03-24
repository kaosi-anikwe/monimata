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
WebSocket endpoint  WS /ws/events?token=<jwt_access_token>

Authentication is via query-param token because the browser/native WebSocket
API does not support custom headers during the HTTP upgrade handshake.

Architecture (Redis pub/sub):
  Each connected client gets its own async Redis pubsub subscription to the
  channel  user:{user_id}:events.  Celery tasks and sync handlers publish to
  that channel via app.ws_manager.notify_user().  This design works correctly
  with multiple FastAPI/Celery workers because Redis is the shared message bus.

Lifecycle:
  1. Validate JWT token → resolve user_id.
  2. Verify the user exists in the DB.
  3. Accept the WebSocket.
  4. Subscribe to user:{user_id}:events in Redis.
  5. Concurrently:
       - Forward every Redis "message" frame to the WebSocket client.
       - Read incoming WebSocket frames; echo "pong" in response to "ping".
  6. On WebSocket disconnect (or any error), cancel both tasks, unsubscribe
     from Redis, and close the async Redis connection.

Event shape (server → client):
    { "type": "invalidate", "keys": ["transactions", "nudges"] }
    { "type": "sync_complete", "account_id": "..." }
"""

from __future__ import annotations

import asyncio
import logging

from jose import JWTError
import redis.asyncio as aioredis
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.models.user import User
from app.core.config import settings
from app.core.database import get_db
from app.ws_manager import ws_channel
from app.core.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/events")
async def events_ws(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
    db: Session = Depends(get_db),
) -> None:
    """
    Authenticated WebSocket endpoint.

    Accepts a JWT in the `token` query parameter.
    Streams server-side invalidation events to the connected client.
    The client may send plain-text "ping" frames to keep the connection alive;
    the server responds with "pong".
    """
    # ── Authenticate ─────────────────────────────────────────────────────────
    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        await websocket.close(code=4001)  # 4001 = unauthorized (WS close code)
        return

    user: User | None = db.get(User, user_id)
    if user is None:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    logger.info("WS connected: user=%s", user_id)

    # ── Redis pub/sub ─────────────────────────────────────────────────────────
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    channel = ws_channel(user_id)
    await pubsub.subscribe(channel)

    # ── Concurrent tasks ──────────────────────────────────────────────────────

    async def _redis_to_ws() -> None:
        """Forward Redis messages to the WebSocket client."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        await websocket.send_text(message["data"])
                    except Exception:
                        # WebSocket closed while we were forwarding — stop loop.
                        return
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("_redis_to_ws error for user=%s", user_id)

    async def _ws_receive() -> None:
        """Handle incoming frames from the client (ping/pong keepalive)."""
        try:
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            pass
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("_ws_receive error for user=%s", user_id)

    redis_task = asyncio.create_task(_redis_to_ws())
    receive_task = asyncio.create_task(_ws_receive())

    try:
        # Block until one of the tasks finishes (disconnect or error).
        done, pending = await asyncio.wait(
            {redis_task, receive_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        # Await cancelled tasks so their CancelledError is consumed cleanly.
        await asyncio.gather(*pending, return_exceptions=True)
    finally:
        try:
            await pubsub.unsubscribe(channel)
        except Exception:
            pass
        try:
            await r.aclose()
        except Exception:
            pass
        logger.info("WS disconnected: user=%s", user_id)
