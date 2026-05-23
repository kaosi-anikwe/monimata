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
Redis client helper for the public calculation engine.

Provides helpers for:
  - JWT access-token blocklist
  - Nudge rule cache
  - Rate-limit counters (via slowapi)
"""

import json
import logging
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


# ── JWT access-token blocklist (read-only) ────────────────────────────────────
# The console gateway writes blocklist entries on logout.
# The public engine reads them to reject revoked tokens.

_BLOCKLIST_PREFIX = "jti_blocklist:"


def is_token_blocklisted(jti: str) -> bool:
    return int(get_redis().exists(f"{_BLOCKLIST_PREFIX}{jti}")) > 0  # type: ignore[arg-type]


# ── Nudge rule cache ──────────────────────────────────────────────────────────
# Rules are pre-bucketed by event type so the Celery worker only loads the
# relevant subset for each transaction.  The cache is rebuilt synchronously on
# every write (create / update / toggle / delete) — no TTL, never stale.

_NUDGE_RULES_PREFIX = "cache:nudge_rules:"


def _rule_to_cache_dict(rule: object) -> dict:
    """Serialise an ORM NudgeRule to a plain JSON-safe dict."""
    return {
        "id": getattr(rule, "id"),
        "slug": getattr(rule, "slug"),
        "title": getattr(rule, "title"),
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
