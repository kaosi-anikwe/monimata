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

"""user streak

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-15

Adds two columns to the users table to track daily-open streaks:
  - streak          INTEGER NOT NULL DEFAULT 0
  - last_streak_date DATE    NULL
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("last_streak_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_streak_date")
    op.drop_column("users", "streak")
