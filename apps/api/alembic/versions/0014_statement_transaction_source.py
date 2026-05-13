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

"""add 'statement' and 'receipt' values to transactionsource enum

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-13
"""

from sqlalchemy import text

from alembic import op

revision: str = "0014"
down_revision: str = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check whether the enum type exists at all.
    type_exists = conn.execute(
        text("SELECT 1 FROM pg_type WHERE typname = 'transactionsource'")
    ).scalar()

    if not type_exists:
        # Fresh database that skipped migration 0011 — create the full enum.
        # ALTER TYPE … ADD VALUE cannot run inside a transaction so we use
        # CREATE TYPE here (which can).
        conn.execute(
            text(
                "CREATE TYPE transactionsource AS ENUM "
                "('bank_alert', 'manual', 'statement', 'receipt')"
            )
        )
    else:
        # Enum exists — add the two new values if not already present.
        # ALTER TYPE … ADD VALUE must run outside a transaction block; Alembic
        # executes DDL outside its implicit transaction when using PostgreSQL.
        for value in ("statement", "receipt"):
            exists = conn.execute(
                text(
                    "SELECT 1 FROM pg_enum "
                    "WHERE enumtypid = 'transactionsource'::regtype "
                    "AND enumlabel = :val"
                ),
                {"val": value},
            ).scalar()
            if not exists:
                # AUTOCOMMIT needed for ALTER TYPE ADD VALUE outside transaction.
                conn.execute(text(f"ALTER TYPE transactionsource ADD VALUE '{value}'"))


def downgrade() -> None:
    # PostgreSQL does not support removing an enum value without recreating the type.
    # A full downgrade would require migrating all rows first.
    # For safety we leave the enum values in place on downgrade.
    pass
