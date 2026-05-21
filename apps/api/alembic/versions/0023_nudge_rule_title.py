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

"""add title column to nudge_rules

Lifts the push-notification title out of the action JSONB blob into its own
TEXT column so it can be queried, filtered, and displayed without parsing JSON.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023"
down_revision: str = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nudge_rules",
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("nudge_rules", "title")
