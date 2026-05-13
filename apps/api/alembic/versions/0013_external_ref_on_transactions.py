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

"""add external_ref to transactions for bank-alert deduplication

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-12
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("external_ref", sa.Text(), nullable=True),
    )
    # Partial unique index: prevents duplicate ingestion of the same bank alert
    # reference while allowing NULL for manual transactions (no reference).
    op.execute(
        "CREATE UNIQUE INDEX uq_transactions_account_external_ref "
        "ON transactions (account_id, external_ref) "
        "WHERE external_ref IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_transactions_account_external_ref")
    op.drop_column("transactions", "external_ref")
