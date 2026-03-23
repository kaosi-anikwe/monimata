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

"""rebuild category_targets; add recurring_rules; add recurrence_id to transactions

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-10

Changes:
  1. Drop old category_targets (if it exists from an earlier manual run) and
     recreate with the new schema:
       - target_type / repeat_cadence / on_refill  →  frequency / behavior
       - add day_of_week, day_of_month columns
       - target_date and repeats retained
  2. Create recurring_rules table
  3. Add recurrence_id FK column to transactions
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Rebuild category_targets ──────────────────────────────────────────
    # The old schema had target_type / repeat_cadence / on_refill.
    # The new schema uses frequency / behavior with extra scheduling columns.
    # Since this table has no production data yet we drop and recreate.
    op.drop_table("category_targets")

    op.create_table(
        "category_targets",
        sa.Column(
            "id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # "weekly" | "monthly" | "yearly" | "custom"
        sa.Column("frequency", sa.Text(), nullable=False),
        # "set_aside" | "refill" | "balance"
        sa.Column("behavior", sa.Text(), nullable=False, server_default="set_aside"),
        sa.Column("target_amount", sa.BigInteger(), nullable=False),
        # Scheduling helpers — only one is non-null per row
        sa.Column("day_of_week", sa.Integer(), nullable=True),  # 0=Mon … 6=Sun
        sa.Column("day_of_month", sa.Integer(), nullable=True),  # 1-31; 0=last day
        sa.Column("target_date", sa.Date(), nullable=True),  # yearly / custom
        # Custom-only repeat toggle (weekly/monthly/yearly always repeat)
        sa.Column(
            "repeats", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index(
        "ix_category_targets_category_id",
        "category_targets",
        ["category_id"],
        unique=True,
    )

    # ── 2. Create recurring_rules ─────────────────────────────────────────────
    op.create_table(
        "recurring_rules",
        sa.Column(
            "id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # daily | weekly | biweekly | monthly | yearly | custom
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column(
            "interval", sa.Integer(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("next_due", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("template", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index("ix_recurring_rules_user_id", "recurring_rules", ["user_id"])
    op.create_index("ix_recurring_rules_next_due", "recurring_rules", ["next_due"])

    # ── 3. Add recurrence_id to transactions ──────────────────────────────────
    op.add_column(
        "transactions",
        sa.Column(
            "recurrence_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("recurring_rules.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_transactions_recurrence_id", "transactions", ["recurrence_id"])


def downgrade() -> None:
    # Reverse order
    op.drop_index("ix_transactions_recurrence_id", table_name="transactions")
    op.drop_column("transactions", "recurrence_id")

    op.drop_index("ix_recurring_rules_next_due", table_name="recurring_rules")
    op.drop_index("ix_recurring_rules_user_id", table_name="recurring_rules")
    op.drop_table("recurring_rules")

    op.drop_index("ix_category_targets_category_id", table_name="category_targets")
    op.drop_table("category_targets")

    # Restore original category_targets schema
    op.create_table(
        "category_targets",
        sa.Column(
            "id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_amount", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column(
            "repeats", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("repeat_cadence", sa.Text(), nullable=True),
        sa.Column("on_refill", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
