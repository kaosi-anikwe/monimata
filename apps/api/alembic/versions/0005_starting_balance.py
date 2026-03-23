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

"""add starting_balance to bank_accounts

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-11

Changes:
  Adds bank_accounts.starting_balance (BIGINT, kobo) — the account balance at
  the moment the user linked their bank account, minus the sum of all
  transactions imported during the initial backfill.

  The displayed balance shown in the app is always:
    starting_balance + SUM(transactions.amount)

  This is correct regardless of Mono test-mode limitations (where
  account.balance is static) and remains correct in production where Mono may
  only return a rolling window of transaction history.

  Back-fill for existing rows:
    starting_balance = balance - COALESCE(SUM(transactions.amount), 0)

  This makes the displayed balance equal to the last-known Mono balance for
  every account already in the database, which is the best approximation we
  can make without re-fetching the full transaction history.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the column as nullable so we can back-fill before enforcing NOT NULL.
    op.add_column(
        "bank_accounts",
        sa.Column("starting_balance", sa.BigInteger(), nullable=True),
    )

    # 2. Back-fill: starting_balance = balance - COALESCE(SUM(transactions.amount), 0)
    op.execute("""
        UPDATE bank_accounts ba
        SET starting_balance = ba.balance - COALESCE(
            (SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = ba.id),
            0
        )
        """)

    # 3. Enforce NOT NULL with a default of 0 for any future rows created before
    #    fetch_transactions has a chance to set it.
    op.alter_column(
        "bank_accounts", "starting_balance", nullable=False, server_default="0"
    )


def downgrade() -> None:
    op.drop_column("bank_accounts", "starting_balance")
