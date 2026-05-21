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
Nudge metrics — daily rollup and query helpers.

The ``roll_up_nudge_stats`` function is called by a Celery beat task at
00:15 WAT each day to aggregate the previous day's nudge activity into
the ``nudge_stats`` table (one row per user × rule × WAT day).

Admin endpoints aggregate across all users.
User endpoints filter by their own user_id.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

WAT = timezone(timedelta(hours=1))


# ── Daily rollup ─────────────────────────────────────────────────────────────


def roll_up_nudge_stats(db: Session, target_date: date | None = None) -> int:
    """Aggregate nudge metrics for *target_date* (defaults to yesterday WAT).

    Writes one row per (user, rule, date) into ``nudge_stats``.  DB-sourced
    fields (delivered, opened, dismissed) come from the ``nudges`` table;
    hit / suppressed counts come from per-user Redis counters written by the
    DSL engine.

    Returns the number of stat rows upserted.
    """
    from app.models.nudge import Nudge
    from app.models.nudge_rule import NudgeRule
    from app.models.nudge_stat import NudgeStat
    from app.services.dsl_engine import get_user_rule_metrics_from_redis

    if target_date is None:
        target_date = (datetime.now(WAT) - timedelta(days=1)).date()

    date_str = target_date.isoformat()

    # UTC boundaries for the WAT calendar day
    day_start_utc = datetime(
        target_date.year, target_date.month, target_date.day, tzinfo=WAT
    ).astimezone(UTC)
    day_end_utc = day_start_utc + timedelta(days=1)

    # -- DB aggregates: delivered, opened, dismissed per (user_id, rule_id) ----
    db_rows = (
        db.query(
            Nudge.user_id,
            Nudge.rule_id,
            func.count(Nudge.id).label("delivered"),
            func.sum(case((Nudge.is_opened.is_(True), 1), else_=0)).label("opened"),
            func.sum(case((Nudge.is_dismissed.is_(True), 1), else_=0)).label("dismissed"),
        )
        .filter(
            Nudge.rule_id.isnot(None),
            Nudge.created_at >= day_start_utc,
            Nudge.created_at < day_end_utc,
        )
        .group_by(Nudge.user_id, Nudge.rule_id)
        .all()
    )

    # Build lookup: (user_id, rule_id) → DB aggregates
    db_agg: dict[tuple[str, str], dict[str, int]] = {}
    user_ids_from_db: set[str] = set()
    for row in db_rows:
        db_agg[(row.user_id, row.rule_id)] = {
            "delivered": row.delivered,
            "opened": row.opened,
            "dismissed": row.dismissed,
        }
        user_ids_from_db.add(row.user_id)

    # All rule IDs (for Redis lookup)
    all_rule_ids = [r.id for r in db.query(NudgeRule.id).all()]

    all_user_ids = user_ids_from_db

    if not all_user_ids and not db_agg:
        logger.info("roll_up_nudge_stats: no data for %s", date_str)
        return 0

    upserted = 0
    for uid in all_user_ids:
        # Per-user Redis counters for this date
        redis_metrics = get_user_rule_metrics_from_redis(uid, all_rule_ids, date_str)

        # Merge: any (user, rule) with a delivery or a Redis hit gets a row
        rule_ids_for_user = {rid for (u, rid) in db_agg if u == uid} | {
            rid for rid, m in redis_metrics.items() if m["hits"] > 0 or m["suppressed"] > 0
        }

        for rid in rule_ids_for_user:
            db_vals = db_agg.get((uid, rid), {"delivered": 0, "opened": 0, "dismissed": 0})
            redis_vals = redis_metrics.get(rid, {"hits": 0, "suppressed": 0})

            hits = redis_vals["hits"] + redis_vals["suppressed"]
            values = {
                "user_id": uid,
                "rule_id": rid,
                "date_wat": target_date,
                "hits": hits,
                "delivered": db_vals["delivered"],
                "suppressed": redis_vals["suppressed"],
                "opened": db_vals["opened"],
                "dismissed": db_vals["dismissed"],
            }

            stmt = pg_insert(NudgeStat).values(**values)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_user_rule_date",
                set_={
                    k: v for k, v in values.items() if k not in ("user_id", "rule_id", "date_wat")
                },
            )
            db.execute(stmt)
            upserted += 1

    db.commit()
    logger.info("roll_up_nudge_stats: upserted %d rows for %s", upserted, date_str)
    return upserted


# ── Admin queries (aggregate across users) ───────────────────────────────────


def get_rule_stats(
    db: Session,
    rule_id: str | None = None,
    days: int = 7,
) -> list[dict]:
    """Return daily stats for one rule or all rules over the last *days* days.

    Aggregates across all users.  Each item includes ``unique_users``.
    """
    from app.models.nudge_rule import NudgeRule
    from app.models.nudge_stat import NudgeStat

    cutoff = (datetime.now(WAT) - timedelta(days=days)).date()
    q = (
        db.query(
            NudgeStat.rule_id,
            NudgeStat.date_wat,
            NudgeRule.slug,
            func.sum(NudgeStat.hits).label("hits"),
            func.sum(NudgeStat.delivered).label("delivered"),
            func.sum(NudgeStat.suppressed).label("suppressed"),
            func.count(func.distinct(NudgeStat.user_id)).label("unique_users"),
            func.sum(NudgeStat.opened).label("opened"),
            func.sum(NudgeStat.dismissed).label("dismissed"),
        )
        .join(NudgeRule, NudgeStat.rule_id == NudgeRule.id)
        .filter(NudgeStat.date_wat >= cutoff)
        .group_by(NudgeStat.rule_id, NudgeStat.date_wat, NudgeRule.slug)
    )
    if rule_id:
        q = q.filter(NudgeStat.rule_id == rule_id)
    q = q.order_by(NudgeStat.date_wat.desc())

    return [
        {
            "rule_id": row.rule_id,
            "slug": row.slug,
            "date_wat": row.date_wat,
            "hits": row.hits or 0,
            "delivered": row.delivered or 0,
            "suppressed": row.suppressed or 0,
            "unique_users": row.unique_users or 0,
            "opened": row.opened or 0,
            "dismissed": row.dismissed or 0,
        }
        for row in q.all()
    ]


def get_rule_stats_summary(db: Session, days: int = 7) -> list[dict]:
    """Aggregate stats across *days* for each rule — sorted by total hits desc.

    Returns one dict per rule with cross-user totals + engagement rate.
    ``unique_users`` is derived via ``COUNT(DISTINCT user_id)``.
    """
    from app.models.nudge_rule import NudgeRule
    from app.models.nudge_stat import NudgeStat

    cutoff = (datetime.now(WAT) - timedelta(days=days)).date()
    rows = (
        db.query(
            NudgeStat.rule_id,
            NudgeRule.slug,
            func.sum(NudgeStat.hits).label("total_hits"),
            func.sum(NudgeStat.delivered).label("total_delivered"),
            func.sum(NudgeStat.suppressed).label("total_suppressed"),
            func.count(func.distinct(NudgeStat.user_id)).label("total_unique_users"),
            func.sum(NudgeStat.opened).label("total_opened"),
            func.sum(NudgeStat.dismissed).label("total_dismissed"),
        )
        .join(NudgeRule, NudgeStat.rule_id == NudgeRule.id)
        .filter(NudgeStat.date_wat >= cutoff)
        .group_by(NudgeStat.rule_id, NudgeRule.slug)
        .order_by(func.sum(NudgeStat.hits).desc())
        .all()
    )

    result = []
    for row in rows:
        delivered = row.total_delivered or 0
        opened = row.total_opened or 0
        engagement = round(opened / delivered, 4) if delivered > 0 else 0.0
        result.append(
            {
                "rule_id": row.rule_id,
                "slug": row.slug,
                "total_hits": row.total_hits or 0,
                "total_delivered": delivered,
                "total_suppressed": row.total_suppressed or 0,
                "total_unique_users": row.total_unique_users or 0,
                "total_opened": opened,
                "total_dismissed": row.total_dismissed or 0,
                "engagement_rate": engagement,
            }
        )
    return result


# ── User queries ─────────────────────────────────────────────────────────────


def get_user_nudge_summary(db: Session, user_id: str, days: int = 7) -> dict:
    """Build a per-user nudge summary for the AI weekly review.

    Reads from the persisted ``nudge_stats`` table for historical data and
    falls back to the ``nudges`` table + live Redis counters for the current
    day (which hasn't been rolled up yet).
    """
    from app.models.category import Category
    from app.models.nudge import Nudge
    from app.models.nudge_rule import NudgeRule
    from app.models.nudge_stat import NudgeStat
    from app.services.dsl_engine import get_user_rule_metrics_from_redis

    now_wat = datetime.now(WAT)
    end_date = now_wat.date()
    start_date = end_date - timedelta(days=days)

    # -- Historical stats from nudge_stats table (excludes today) --------------
    stat_rows = (
        db.query(
            NudgeStat.rule_id,
            func.sum(NudgeStat.delivered).label("delivered"),
            func.sum(NudgeStat.suppressed).label("suppressed"),
            func.sum(NudgeStat.opened).label("opened"),
            func.sum(NudgeStat.dismissed).label("dismissed"),
        )
        .filter(
            NudgeStat.user_id == user_id,
            NudgeStat.date_wat >= start_date,
            NudgeStat.date_wat <= end_date,
        )
        .group_by(NudgeStat.rule_id)
        .all()
    )

    rule_agg: dict[str, dict[str, int]] = {}
    for row in stat_rows:
        rule_agg[row.rule_id] = {
            "delivered": row.delivered or 0,
            "suppressed": row.suppressed or 0,
            "opened": row.opened or 0,
            "dismissed": row.dismissed or 0,
        }

    # -- Today's live data (not yet rolled up) from nudges + Redis -------------
    today_start_utc = datetime(end_date.year, end_date.month, end_date.day, tzinfo=WAT).astimezone(
        UTC
    )
    today_end_utc = today_start_utc + timedelta(days=1)

    today_nudges = (
        db.query(Nudge)
        .filter(
            Nudge.user_id == user_id,
            Nudge.rule_id.isnot(None),
            Nudge.created_at >= today_start_utc,
            Nudge.created_at < today_end_utc,
        )
        .all()
    )

    for n in today_nudges:
        if n.rule_id is None:
            continue
        agg = rule_agg.setdefault(
            n.rule_id,
            {
                "delivered": 0,
                "suppressed": 0,
                "opened": 0,
                "dismissed": 0,
            },
        )
        agg["delivered"] += 1
        if n.is_opened:
            agg["opened"] += 1
        if n.is_dismissed:
            agg["dismissed"] += 1

    # Today's suppressed counts from Redis
    all_rule_ids = [r.id for r in db.query(NudgeRule.id).filter(NudgeRule.active.is_(True)).all()]
    today_redis = get_user_rule_metrics_from_redis(user_id, all_rule_ids, end_date.isoformat())
    for rid, m in today_redis.items():
        if m["suppressed"] > 0:
            agg = rule_agg.setdefault(
                rid,
                {
                    "delivered": 0,
                    "suppressed": 0,
                    "opened": 0,
                    "dismissed": 0,
                },
            )
            agg["suppressed"] += m["suppressed"]

    # -- Build top_rules with category info ------------------------------------
    period_start_utc = datetime(
        start_date.year, start_date.month, start_date.day, tzinfo=WAT
    ).astimezone(UTC)

    cat_rows = (
        db.query(Nudge.rule_id, Nudge.category_id)
        .filter(
            Nudge.user_id == user_id,
            Nudge.rule_id.isnot(None),
            Nudge.category_id.isnot(None),
            Nudge.created_at >= period_start_utc,
            Nudge.created_at < today_end_utc,
        )
        .distinct()
        .all()
    )
    rule_cats: dict[str, set[str]] = {}
    cat_ids: set[str] = set()
    for cr in cat_rows:
        if cr.rule_id and cr.category_id:
            rule_cats.setdefault(cr.rule_id, set()).add(cr.category_id)
            cat_ids.add(cr.category_id)

    cat_names: dict[str, str] = {}
    if cat_ids:
        cats = db.query(Category.id, Category.name).filter(Category.id.in_(cat_ids)).all()
        cat_names = {c.id: c.name for c in cats}

    # Resolve rule_id → slug
    rule_slug_map: dict[str, str] = {}
    rule_ids_in_agg = list(rule_agg.keys())
    if rule_ids_in_agg:
        slug_rows = (
            db.query(NudgeRule.id, NudgeRule.slug).filter(NudgeRule.id.in_(rule_ids_in_agg)).all()
        )
        rule_slug_map = {r.id: r.slug for r in slug_rows}

    # Totals
    total_delivered = sum(a["delivered"] for a in rule_agg.values())
    total_suppressed = sum(a["suppressed"] for a in rule_agg.values())
    total_opened = sum(a["opened"] for a in rule_agg.values())
    total_dismissed = sum(a["dismissed"] for a in rule_agg.values())

    unsorted: list[dict[str, int | str | list[str]]] = [
        {
            "slug": rule_slug_map.get(rid, rid),
            "count": vals["delivered"] + vals["suppressed"],
            "delivered": vals["delivered"],
            "suppressed": vals["suppressed"],
            "categories": sorted(cat_names.get(cid, cid) for cid in rule_cats.get(rid, set())),
        }
        for rid, vals in rule_agg.items()
    ]

    top_rules = sorted(
        unsorted,
        key=lambda x: x["count"] if isinstance(x["count"], int) else 0,
        reverse=True,
    )[:10]

    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_nudges": total_delivered,
        "total_suppressed": total_suppressed,
        "opened": total_opened,
        "dismissed": total_dismissed,
        "top_rules": top_rules,
    }
