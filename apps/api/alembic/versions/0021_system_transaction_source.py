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

"""add 'system' value to transactionsource enum

Adds TransactionSource.system for synthetic MoniMata-generated transactions
(e.g. the MONIMATA_STARTING_BALANCE clean-cut seed transaction).

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-18
"""

from sqlalchemy import text

from alembic import op

revision: str = "0021"
down_revision: str = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ALTER TYPE … ADD VALUE must run outside a transaction block; Alembic
    # executes DDL outside its implicit transaction on PostgreSQL.
    exists = conn.execute(
        text(
            "SELECT 1 FROM pg_enum "
            "WHERE enumtypid = 'transactionsource'::regtype "
            "AND enumlabel = 'system'"
        )
    ).scalar()

    if not exists:
        conn.execute(text("ALTER TYPE transactionsource ADD VALUE 'system'"))


def downgrade() -> None:
    # PostgreSQL does not support removing an enum value without recreating the
    # entire type.  Leave the value in place on downgrade.
    pass
