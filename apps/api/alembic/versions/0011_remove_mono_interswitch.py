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

"""Remove Mono and Interswitch artefacts

Drops the pending_bill_payments table and removes Mono-specific columns from
bank_accounts.  Transactions are now sourced exclusively from forwarded bank
alert emails (Cloudflare email-worker) or manual entry.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-11
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Drop pending_bill_payments ────────────────────────────────────────────
    op.drop_index("ix_pending_bill_payments_ref", table_name="pending_bill_payments", if_exists=True)
    op.drop_index("ix_pending_bill_payments_user_id", table_name="pending_bill_payments", if_exists=True)
    op.drop_table("pending_bill_payments")

    # ── Remove Mono-specific columns from bank_accounts ───────────────────────
    # Drop the partial unique index on mono_account_id first (created in 0008)
    op.drop_index(
        "uix_bank_accounts_mono_account_id_active",
        table_name="bank_accounts",
        if_exists=True,
    )

    op.drop_column("bank_accounts", "mono_account_id")
    op.drop_column("bank_accounts", "is_mono_linked")
    op.drop_column("bank_accounts", "linked_at")
    op.drop_column("bank_accounts", "unlinked_at")
    op.drop_column("bank_accounts", "previous_mono_account_id")
    op.drop_column("bank_accounts", "requires_reauth")


def downgrade() -> None:
    # ── Restore Mono columns on bank_accounts ─────────────────────────────────
    op.add_column(
        "bank_accounts",
        sa.Column("mono_account_id", sa.Text(), nullable=True),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("is_mono_linked", sa.Boolean(), nullable=False, server_default="false"),
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
        sa.Column("previous_mono_account_id", sa.Text(), nullable=True),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("requires_reauth", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_index(
        "uix_bank_accounts_mono_account_id_active",
        "bank_accounts",
        ["mono_account_id"],
        unique=True,
        postgresql_where=sa.text("mono_account_id IS NOT NULL AND deleted_at IS NULL"),
    )

    # ── Restore pending_bill_payments ─────────────────────────────────────────
    op.create_table(
        "pending_bill_payments",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("ref", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("biller_name", sa.Text(), nullable=True),
        sa.Column("amount_kobo", sa.BigInteger(), nullable=False),
        sa.Column("category_id", sa.Text(), nullable=True),
        sa.Column("payment_code", sa.Text(), nullable=True),
        sa.Column("customer_id", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("meta", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pending_bill_payments_ref", "pending_bill_payments", ["ref"], unique=True)
    op.create_index("ix_pending_bill_payments_user_id", "pending_bill_payments", ["user_id"])
