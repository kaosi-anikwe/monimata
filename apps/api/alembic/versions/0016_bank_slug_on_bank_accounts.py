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

"""add bank_slug to bank_accounts for exact-match filtering

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-14

Rationale
---------
Previously, matching a DB account to a registry bank relied on a
case-insensitive ILIKE on ``institution`` (display name), or an equality
check comparing institution against the registry slug — both fragile.

``bank_slug`` stores the machine-readable registry key (e.g. ``"opay"``)
so every filter can use a simple ``=`` comparison.

Backfill
--------
A CASE expression maps the known display names to their registry slugs.
Any institution value that doesn't appear in the CASE is left NULL; those
accounts will gracefully fall back to the old institution-based path until
the user re-adds the account via the updated client.
"""

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("bank_slug", sa.String(50), nullable=True),
    )
    op.create_index("ix_bank_accounts_bank_slug", "bank_accounts", ["bank_slug"])

    # Best-effort backfill: map known display names to their registry slugs.
    # Unknown institutions are left NULL — they will be set when the account
    # is next updated by a client that sends bank_slug.
    op.execute(
        """
        UPDATE bank_accounts
        SET bank_slug = CASE institution
            WHEN 'OPay'        THEN 'opay'
            WHEN 'GTBank'      THEN 'gtbank'
            WHEN 'UBA'         THEN 'uba'
            WHEN 'Access Bank' THEN 'access'
            WHEN 'Zenith Bank' THEN 'zenith'
            WHEN 'First Bank'  THEN 'firstbank'
            ELSE NULL
        END
        WHERE bank_slug IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_bank_accounts_bank_slug", table_name="bank_accounts")
    op.drop_column("bank_accounts", "bank_slug")
