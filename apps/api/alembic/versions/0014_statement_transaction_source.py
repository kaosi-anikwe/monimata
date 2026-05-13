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

from alembic import op

revision: str = "0014"
down_revision: str = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE … ADD VALUE outside a transaction.
    op.execute("ALTER TYPE transactionsource ADD VALUE IF NOT EXISTS 'statement'")
    op.execute("ALTER TYPE transactionsource ADD VALUE IF NOT EXISTS 'receipt'")


def downgrade() -> None:
    # PostgreSQL does not support removing an enum value without recreating the type.
    # A full downgrade would require migrating all rows first.
    # For safety we leave the enum values in place on downgrade.
    pass
