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

"""initial schema — all core tables

Revision ID: 0001
Revises:
Create Date: 2026-03-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("email", sa.Text(), unique=True, nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("first_name", sa.Text(), nullable=True),
        sa.Column("last_name", sa.Text(), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nudge_settings", postgresql.JSONB(), nullable=False, server_default=sa.text("""
            '{"quiet_hours_start":"23:00","quiet_hours_end":"07:00","fatigue_limit":3,"enabled":true}'
        """)),
        sa.Column("onboarded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("identity_verified", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── bank_accounts ─────────────────────────────────────────────────────────
    op.create_table(
        "bank_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mono_account_id", sa.Text(), unique=True, nullable=False),
        sa.Column("institution", sa.Text(), nullable=False),
        sa.Column("account_name", sa.Text(), nullable=False),
        sa.Column("account_number", sa.Text(), nullable=True),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="NGN"),
        sa.Column("balance", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_bank_accounts_user_id", "bank_accounts", ["user_id"])

    # ── category_groups ───────────────────────────────────────────────────────
    op.create_table(
        "category_groups",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── categories ────────────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("category_groups.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_categories_user_id", "categories", ["user_id"])
    op.create_index("idx_categories_group_id", "categories", ["group_id"])

    # ── transactions ──────────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("bank_accounts.id"), nullable=False),
        sa.Column("mono_id", sa.Text(), unique=True, nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("narration", sa.Text(), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("balance_after", sa.BigInteger(), nullable=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("is_split", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_manual", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source", sa.String(20), nullable=False, server_default="mono"),
        sa.Column("interswitch_ref", sa.Text(), unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_transactions_user_id_date", "transactions", ["user_id", sa.text("date DESC")])
    op.create_index("idx_transactions_account_id", "transactions", ["account_id"])
    op.create_index("idx_transactions_category_id", "transactions", ["category_id"])
    op.create_index(
        "idx_transactions_mono_id",
        "transactions",
        ["mono_id"],
        postgresql_where=sa.text("mono_id IS NOT NULL"),
    )

    # ── transaction_splits ────────────────────────────────────────────────────
    op.create_table(
        "transaction_splits",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
    )

    # ── category_targets ──────────────────────────────────────────────────────
    op.create_table(
        "category_targets",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_amount", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("repeats", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("repeat_cadence", sa.Text(), nullable=True),
        sa.Column("on_refill", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── budget_months ─────────────────────────────────────────────────────────
    op.create_table(
        "budget_months",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("assigned", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("activity", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "category_id", "month", name="uq_budget_months_user_cat_month"),
    )
    op.create_index("idx_budget_months_user_month", "budget_months", ["user_id", "month"])

    # ── narration_category_map ────────────────────────────────────────────────
    op.create_table(
        "narration_category_map",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("narration_key", sa.Text(), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "narration_key", name="uq_narration_map_user_key"),
    )

    # ── nudges ────────────────────────────────────────────────────────────────
    op.create_table(
        "nudges",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_type", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("is_opened", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_dismissed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_nudges_user_id", "nudges", ["user_id", sa.text("created_at DESC")])

    # ── articles ──────────────────────────────────────────────────────────────
    op.create_table(
        "articles",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("slug", sa.Text(), unique=True, nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_nugget", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_articles_slug", "articles", ["slug"])
    op.create_index("idx_articles_tags", "articles", ["tags"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_table("articles")
    op.drop_table("nudges")
    op.drop_table("narration_category_map")
    op.drop_table("budget_months")
    op.drop_table("category_targets")
    op.drop_table("transaction_splits")
    op.drop_table("transactions")
    op.drop_table("categories")
    op.drop_table("category_groups")
    op.drop_table("bank_accounts")
    op.drop_table("users")
