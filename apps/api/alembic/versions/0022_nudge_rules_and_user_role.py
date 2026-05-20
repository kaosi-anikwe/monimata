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

"""add user role enum + nudge_rules table

Adds:
  - userrole PostgreSQL enum type (user, admin)
  - role column on users (NOT NULL DEFAULT 'user')
  - nudge_rules table for the DSL-driven nudge engine

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0022"
down_revision: str = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on = None


def upgrade() -> None:
    # ── userrole enum + role column on users ──────────────────────────────────
    userrole = postgresql.ENUM("user", "admin", name="userrole")
    userrole.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("user", "admin", name="userrole", create_type=False),
            nullable=False,
            server_default="user",
        ),
    )

    # ── nudge_rules ───────────────────────────────────────────────────────────
    op.create_table(
        "nudge_rules",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        sa.Column("gid", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("evts", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("days_back", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conds", postgresql.JSONB(), nullable=False),
        sa.Column("action", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_nudge_rules_gid", "nudge_rules", ["gid"])
    op.create_index("ix_nudge_rules_active", "nudge_rules", ["active"])


def downgrade() -> None:
    op.drop_index("ix_nudge_rules_active", table_name="nudge_rules")
    op.drop_index("ix_nudge_rules_gid", table_name="nudge_rules")
    op.drop_table("nudge_rules")

    op.drop_column("users", "role")
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
