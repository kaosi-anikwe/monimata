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

"""change transactions.date from DATE to TIMESTAMPTZ

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-11

Changes:
  Promote transactions.date from DATE (date-only) to TIMESTAMP WITH TIME ZONE
  so we can store the exact moment a transaction occurred.  This enables:
    - ±2-hour manual-match window instead of ±1-day (avoids false matches for
      users who spend the same amount every day)
    - Correct time-of-day display in the mobile app
    - Sorting transactions by precise time within the same calendar day

  Postgres casts DATE → TIMESTAMPTZ at midnight UTC, so all existing rows are
  preserved with a 00:00:00+00 time – accurate for Mono-imported transactions
  (Mono only returns dates for historical data anyway) and convertible by the
  mobile app's sync logic.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cast existing DATE values to TIMESTAMPTZ at midnight UTC.
    # The cast is lossless — DATE '2025-03-10' becomes '2025-03-10 00:00:00+00'.
    op.alter_column(
        "transactions",
        "date",
        existing_type=sa.Date(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="date AT TIME ZONE 'UTC'",
        nullable=False,
    )


def downgrade() -> None:
    # Truncate back to date (time component is discarded).
    op.alter_column(
        "transactions",
        "date",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Date(),
        postgresql_using="date::date",
        nullable=False,
    )
