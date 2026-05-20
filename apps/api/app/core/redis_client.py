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
  - Rate-limit counters
  - Celery broker (via Celery's own connection)
"""

import json
import logging
from datetime import timedelta
from typing import TYPE_CHECKING, cast

import redis

from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

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


# ── Password-reset OTP store ──────────────────────────────────────────────────
# OTPs are short-lived (10 min) and keyed by lowercased email.
# After successful verification the OTP is deleted immediately (single-use).

_OTP_PREFIX = "pw_otp:"
OTP_TTL_SECONDS = 600  # 10 minutes


def store_otp(email: str, otp: str) -> None:
    get_redis().setex(f"{_OTP_PREFIX}{email.lower()}", OTP_TTL_SECONDS, otp)


def get_otp(email: str) -> str | None:
    return cast(str | None, get_redis().get(f"{_OTP_PREFIX}{email.lower()}"))


def delete_otp(email: str) -> None:
    get_redis().delete(f"{_OTP_PREFIX}{email.lower()}")


# ── Password-reset token store ────────────────────────────────────────────────
# After OTP verification the client receives an opaque reset token.
# This token is single-use and expires after 15 minutes.  The value stored
# is the user's email so step 3 can look up the account without re-querying OTP.

_RESET_TOKEN_PREFIX = "pw_reset:"
RESET_TOKEN_TTL_SECONDS = 900  # 15 minutes


def store_reset_token(token: str, email: str) -> None:
    get_redis().setex(f"{_RESET_TOKEN_PREFIX}{token}", RESET_TOKEN_TTL_SECONDS, email.lower())


def get_reset_token_email(token: str) -> str | None:
    return cast(str | None, get_redis().get(f"{_RESET_TOKEN_PREFIX}{token}"))


def delete_reset_token(token: str) -> None:
    get_redis().delete(f"{_RESET_TOKEN_PREFIX}{token}")


# ── Nudge rule cache ──────────────────────────────────────────────────────────
# Rules are pre-bucketed by event type so the Celery worker only loads the
# relevant subset for each transaction.  The cache is rebuilt synchronously on
# every admin write (create / update / toggle / delete) — no TTL, never stale.

_NUDGE_RULES_PREFIX = "cache:nudge_rules:"


def _rule_to_cache_dict(rule: object) -> dict:
    """Serialise an ORM NudgeRule to a plain JSON-safe dict."""
    return {
        "id": getattr(rule, "id"),
        "slug": getattr(rule, "slug"),
        "gid": getattr(rule, "gid"),
        "active": getattr(rule, "active"),
        "evts": list(getattr(rule, "evts")),
        "days_back": getattr(rule, "days_back"),
        "conds": getattr(rule, "conds"),
        "action": getattr(rule, "action"),
    }


def rebuild_rule_cache_for_evt(db: "Session", evt_type: str) -> None:
    """Query every active rule that handles *evt_type* and write it to Redis.

    Key:   cache:nudge_rules:{evt_type}
    Value: JSON-serialised list[dict]
    No TTL — the key lives until the next rule write re-invokes this function.
    """
    from app.models.nudge_rule import NudgeRule

    rules = (
        db.query(NudgeRule)
        .filter(NudgeRule.active.is_(True), NudgeRule.evts.contains([evt_type]))
        .all()
    )
    payload = json.dumps([_rule_to_cache_dict(r) for r in rules])
    get_redis().set(f"{_NUDGE_RULES_PREFIX}{evt_type}", payload)
    logger.debug("Rebuilt nudge rule cache: evt=%s active_rules=%d", evt_type, len(rules))


def invalidate_and_rebuild(db: "Session", evts: list[str]) -> None:
    """Rebuild every cache bucket affected by *evts*.

    Call this after any create, update, toggle, or delete on a NudgeRule,
    passing the rule's ``evts`` list.  Deduplicates automatically.
    """
    for evt_type in dict.fromkeys(evts):  # deduplicate, preserve insertion order
        rebuild_rule_cache_for_evt(db, evt_type)


def load_rules_for_evt(evt_type: str) -> list[dict]:
    """Return the active rule dicts for *evt_type*, reading from Redis.

    On a cache miss (cold Redis, first call after a flush) the function creates
    a short-lived DB session, rebuilds the bucket, then returns the freshly
    cached data.  This fallback keeps the worker self-healing without requiring
    an explicit warm-up step.
    """
    raw = cast(str | None, get_redis().get(f"{_NUDGE_RULES_PREFIX}{evt_type}"))
    if raw is not None:
        return cast(list[dict], json.loads(raw))

    logger.info("Nudge rule cache miss for evt=%s — rebuilding from DB", evt_type)
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        rebuild_rule_cache_for_evt(db, evt_type)
    except Exception:
        logger.exception("Failed to rebuild nudge rule cache for evt=%s", evt_type)
        return []
    finally:
        db.close()

    raw = cast(str | None, get_redis().get(f"{_NUDGE_RULES_PREFIX}{evt_type}"))
    return cast(list[dict], json.loads(raw)) if raw else []


def warm_nudge_rule_cache(db: "Session") -> None:
    """Populate all event-type cache buckets from the DB.

    Called once at FastAPI startup.  Errors are caught per-bucket so a single
    failure does not prevent the remaining buckets from being warmed.
    """
    from app.schemas.nudge_rule import VALID_EVTS

    success = 0
    for evt_type in sorted(VALID_EVTS):
        try:
            rebuild_rule_cache_for_evt(db, evt_type)
            success += 1
        except Exception:
            logger.exception("warm_nudge_rule_cache: failed for evt=%s", evt_type)
    logger.info("Nudge rule cache warmed: %d/%d buckets populated", success, len(VALID_EVTS))
