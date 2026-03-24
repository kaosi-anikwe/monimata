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

"""manual accounts — nullable mono_account_id, new fields, soft-delete

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Make mono_account_id nullable (manual accounts have no Mono ID)
    op.alter_column("bank_accounts", "mono_account_id", nullable=True)

    # 2. Drop the global unique constraint on mono_account_id
    op.drop_constraint(
        "bank_accounts_mono_account_id_key", "bank_accounts", type_="unique"
    )

    # 3. Create a partial unique index — unique only when value IS NOT NULL
    op.create_index(
        "ix_bank_accounts_mono_account_id_unique",
        "bank_accounts",
        ["mono_account_id"],
        unique=True,
        postgresql_where=sa.text("mono_account_id IS NOT NULL"),
    )

    # 4. Add new columns
    op.add_column(
        "bank_accounts",
        sa.Column("bank_code", sa.Text(), nullable=True),
    )
    # Repurpose the existing account_number column to hold the full 10-digit NUBAN.
    # (Previously stored only last-4 digits; new semantics: full NUBAN, AES-256-GCM encrypted.)
    op.alter_column(
        "bank_accounts",
        "account_number",
        comment="Full 10-digit NUBAN, stored AES-256-GCM encrypted",
    )
    op.add_column(
        "bank_accounts",
        sa.Column(
            "balance_as_of",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp of last manual balance update",
        ),
    )
    op.add_column(
        "bank_accounts",
        sa.Column(
            "is_mono_linked",
            sa.Boolean(),
            nullable=False,
            server_default="false",
            comment="True when a live Mono account_id is attached",
        ),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("unlinked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "bank_accounts",
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Set on soft-delete; NULL means the account is live",
        ),
    )
    op.add_column(
        "bank_accounts",
        sa.Column(
            "previous_mono_account_id",
            sa.Text(),
            nullable=True,
            comment="Preserved from last unlink; used for re-link recognition",
        ),
    )
    op.add_column(
        "bank_accounts",
        sa.Column(
            "balance_adjustments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Append-only audit log of manual balance changes",
        ),
    )


def downgrade() -> None:
    op.drop_column("bank_accounts", "balance_adjustments")
    op.drop_column("bank_accounts", "previous_mono_account_id")
    op.drop_column("bank_accounts", "deleted_at")
    op.drop_column("bank_accounts", "unlinked_at")
    op.drop_column("bank_accounts", "linked_at")
    op.drop_column("bank_accounts", "is_mono_linked")
    op.drop_column("bank_accounts", "balance_as_of")
    op.drop_column("bank_accounts", "bank_code")

    op.drop_index("ix_bank_accounts_mono_account_id_unique", table_name="bank_accounts")
    op.create_unique_constraint(
        "bank_accounts_mono_account_id_key", "bank_accounts", ["mono_account_id"]
    )
    op.alter_column("bank_accounts", "mono_account_id", nullable=False)
