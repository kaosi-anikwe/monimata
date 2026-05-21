"""Seed four hardcoded nudge triggers as DSL rules.

Converts the four legacy hardcoded triggers (pay_received, large_single_tx,
threshold_80, threshold_100) into first-class DSL rows in the nudge_rules
table.  The slugs are intentionally identical to the old trigger_type strings
so that _today_nudge_exists deduplication prevents double-firing during any
overlap window.

Uses ON CONFLICT (slug) DO NOTHING so the migration is idempotent — re-running
it on an environment that already has the rows is harmless.

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-21
"""
# ruff: noqa: E501

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO nudge_rules
                (id, slug, title, gid, active, evts, days_back, conds, action, created_at, updated_at)
            VALUES
            (
                gen_random_uuid(),
                'pay_received',
                'Money don enter! \U0001f389',
                'income_alerts',
                true,
                ARRAY['credit_cat', 'credit_uncat'],
                0,
                '{"op": "AND", "rules": [{"fact": "tx.amt", "op": "gte", "val": 5000000}]}'::jsonb,
                '{"tmpls": [
                    "Credit of {tx.amt} kobo don land! Time to give every kobo a job \u2014 assign am to your budget.",
                    "Money don enter \u2014 {tx.amt} kobo. Assign am to your budget categories before e disappear."
                ]}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (slug) DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO nudge_rules
                (id, slug, title, gid, active, evts, days_back, conds, action, created_at, updated_at)
            VALUES
            (
                gen_random_uuid(),
                'large_single_tx',
                'Big spend on {cat.name}',
                'budget_pacing',
                true,
                ARRAY['debit_cat'],
                0,
                '{"op": "AND", "rules": [{"fact": "cat.tx_pct", "op": "gte", "val": 0.4}]}'::jsonb,
                '{"tmpls": [
                    "One transaction of {tx.amt} kobo just take {cat.tx_pct:.0%} of your {cat.name} budget. Check am.",
                    "Chai! {tx.amt} kobo in {cat.name} one time? That na {cat.tx_pct:.0%} of your monthly plan."
                ]}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (slug) DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO nudge_rules
                (id, slug, title, gid, active, evts, days_back, conds, action, created_at, updated_at)
            VALUES
            (
                gen_random_uuid(),
                'threshold_80',
                '\u26a0\ufe0f {cat.name} don reach 80%',
                'budget_pacing',
                true,
                ARRAY['debit_cat'],
                0,
                '{"op": "AND", "rules": [
                    {"fact": "cat.spend_pct", "op": "gte", "val": 0.8},
                    {"fact": "cat.spend_pct", "op": "lt",  "val": 1.0}
                ]}'::jsonb,
                '{"tmpls": [
                    "You don use {cat.spend_pct:.0%} of your {cat.name} budget. Only {cat.rem} kobo remain \u2014 use am wisely!",
                    "{cat.name} almost done o! {cat.rem} kobo remain from your {cat.amt} kobo plan.",
                    "Guy, you don reach {cat.spend_pct:.0%} for {cat.name}. {cat.rem} kobo remain \u2014 no overdo am."
                ]}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (slug) DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO nudge_rules
                (id, slug, title, gid, active, evts, days_back, conds, action, created_at, updated_at)
            VALUES
            (
                gen_random_uuid(),
                'threshold_100',
                '\U0001f6a8 {cat.name} budget don finish!',
                'budget_pacing',
                true,
                ARRAY['debit_cat'],
                0,
                '{"op": "AND", "rules": [{"fact": "cat.spend_pct", "op": "gte", "val": 1.0}]}'::jsonb,
                '{"tmpls": [
                    "You don cross your {cat.name} budget! Time to move money from another category.",
                    "{cat.name} don dry! You spend pass your plan. Readjust your budget now.",
                    "E don do for {cat.name}. You overrun your budget \u2014 control the situation."
                ]}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (slug) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM nudge_rules "
            "WHERE slug IN ('pay_received', 'large_single_tx', 'threshold_80', 'threshold_100')"
        )
    )
