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

"""add username to users; drop bank_code from bank_accounts

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-12
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users.username ────────────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("username", sa.Text(), nullable=True),
    )
    # Unique index on lower(username) so the constraint is case-insensitive.
    # Stored values are already lowercased by the application, but the functional
    # index provides a database-level safety net.
    op.execute(
        "CREATE UNIQUE INDEX ix_users_username_lower "
        "ON users (lower(username)) "
        "WHERE username IS NOT NULL"
    )

    # ── bank_accounts.bank_code ───────────────────────────────────────────────
    op.drop_column("bank_accounts", "bank_code")


def downgrade() -> None:
    # Restore bank_code
    op.add_column(
        "bank_accounts",
        sa.Column("bank_code", sa.Text(), nullable=True),
    )

    # Remove username index and column
    op.execute("DROP INDEX IF EXISTS ix_users_username_lower")
    op.drop_column("users", "username")
