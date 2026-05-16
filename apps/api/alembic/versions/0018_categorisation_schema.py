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

"""categorisation schema

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-16

Phase 1 of the Automated Financial Categorisation System:

transactions table:
  - cleaned_narration   VARCHAR(255)  NULL
      Protocol-stripped, lowercase narration used by the categorisation pipeline.
  - categorization_source VARCHAR(30) NULL
      Which tier assigned the category: exact_match | global_merchant |
      heuristic | vector | llm | manual
  - category_confidence INTEGER NOT NULL DEFAULT 0
      Confidence score 0–100 set by the assigning tier.

New tables:
  - user_category_rules
      Tier 1 exact-match cache: user_id + cleaned_narration → category.
      Unique constraint on (user_id, cleaned_narration) provides the
      composite B-Tree index for O(1) lookups.
  - user_ai_credentials
      BYOK (Bring Your Own Key) encrypted API keys for Tier 3 LLM fallback.
  - user_ai_usage_logs
      Per-call token accounting for LLM categorisation requests.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── transactions: three new categorisation columns ────────────────────────
    op.add_column(
        "transactions",
        sa.Column("cleaned_narration", sa.String(255), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("categorization_source", sa.String(30), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "category_confidence",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # ── user_category_rules ───────────────────────────────────────────────────
    op.create_table(
        "user_category_rules",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("cleaned_narration", sa.String(255), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "last_triggered",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "cleaned_narration",
            name="uq_user_category_rule_user_narration",
        ),
    )
    # The UniqueConstraint above creates the composite B-Tree index implicitly.
    # An additional index is not required for PostgreSQL.

    # ── user_ai_credentials ───────────────────────────────────────────────────
    op.create_table(
        "user_ai_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── user_ai_usage_logs ────────────────────────────────────────────────────
    op.create_table(
        "user_ai_usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_ai_usage_logs_user_ts",
        "user_ai_usage_logs",
        ["user_id", "timestamp"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_ai_usage_logs_user_ts", table_name="user_ai_usage_logs")
    op.drop_table("user_ai_usage_logs")
    op.drop_table("user_ai_credentials")
    op.drop_table("user_category_rules")
    op.drop_column("transactions", "category_confidence")
    op.drop_column("transactions", "categorization_source")
    op.drop_column("transactions", "cleaned_narration")
