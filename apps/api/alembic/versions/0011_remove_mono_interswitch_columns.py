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

"""Remove Mono/Interswitch columns; promote source to enum; drop is_manual

Transactions are now sourced via forwarded bank-alert emails (Cloudflare
email-worker) or manual entry only.  Mono Connect and Interswitch Quickteller
integrations have been removed.

Changes
───────
transactions
  - DROP  mono_id           (Mono dedup key)
  - DROP  interswitch_ref   (Interswitch payment reference)
  - DROP  is_manual         (always true now — replaced by source enum)
  - ALTER source  VARCHAR → PostgreSQL ENUM('bank_alert','manual')
                  server_default 'manual'

bank_accounts
  - DROP  mono_account_id
  - DROP  is_mono_linked
  - DROP  linked_at
  - DROP  unlinked_at
  - DROP  previous_mono_account_id
  - DROP  requires_reauth

DROP TABLE pending_bill_payments

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

# The PostgreSQL enum type name must match the SQLAlchemy model declaration.
_source_enum = PG_ENUM("bank_alert", "manual", name="transactionsource", create_type=False)


def upgrade() -> None:
    # ── 1. Drop pending_bill_payments (may already be gone) ───────────────────
    op.drop_table("pending_bill_payments", if_exists=True)

    # ── 2. transactions: drop Mono / Interswitch / is_manual columns ──────────
    # Use IF EXISTS so the migration is safe to re-run after a partial upgrade.
    inspector = sa.inspect(op.get_bind())
    tx_cols = {c["name"] for c in inspector.get_columns("transactions")}

    with op.batch_alter_table("transactions") as batch_op:
        if "mono_id" in tx_cols:
            batch_op.drop_column("mono_id")
        if "interswitch_ref" in tx_cols:
            batch_op.drop_column("interswitch_ref")
        if "is_manual" in tx_cols:
            batch_op.drop_column("is_manual")

    # ── 3. transactions.source: VARCHAR → PostgreSQL ENUM ────────────────────
    # Refresh column info after the drops above.
    col_types = {c["name"]: str(c["type"]) for c in inspector.get_columns("transactions")}
    if "VARCHAR" in col_types.get("source", "VARCHAR").upper():
        _source_enum_create = PG_ENUM("bank_alert", "manual", name="transactionsource")
        _source_enum_create.create(op.get_bind(), checkfirst=True)

        # Must drop the VARCHAR default before altering the column type.
        op.execute("ALTER TABLE transactions ALTER COLUMN source DROP DEFAULT")
        # Remap legacy values: 'mono' and 'interswitch' rows become 'bank_alert'
        # since they represent externally sourced transactions, not user entry.
        op.execute(
            "UPDATE transactions SET source = 'bank_alert' "
            "WHERE source NOT IN ('bank_alert', 'manual')"
        )
        op.execute(
            "ALTER TABLE transactions "
            "ALTER COLUMN source TYPE transactionsource "
            "USING source::transactionsource"
        )
        op.execute(
            "ALTER TABLE transactions ALTER COLUMN source SET DEFAULT 'manual'::transactionsource"
        )

    # ── 4. bank_accounts: drop Mono lifecycle columns (may already be gone) ───
    ba_cols = {c["name"] for c in inspector.get_columns("bank_accounts")}
    mono_ba_cols = {
        "mono_account_id",
        "is_mono_linked",
        "linked_at",
        "unlinked_at",
        "previous_mono_account_id",
        "requires_reauth",
    }
    cols_to_drop = mono_ba_cols & ba_cols
    if cols_to_drop:
        with op.batch_alter_table("bank_accounts") as batch_op:
            for col in cols_to_drop:
                batch_op.drop_column(col)


def downgrade() -> None:
    # ── 4. Restore bank_accounts Mono columns ─────────────────────────────────
    with op.batch_alter_table("bank_accounts") as batch_op:
        batch_op.add_column(
            sa.Column("requires_reauth", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(sa.Column("previous_mono_account_id", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("unlinked_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("is_mono_linked", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(sa.Column("mono_account_id", sa.Text(), nullable=True))

    # ── 3. transactions.source: ENUM → VARCHAR ────────────────────────────────
    op.execute(
        "ALTER TABLE transactions ALTER COLUMN source TYPE VARCHAR(20) USING source::VARCHAR"
    )
    op.execute("ALTER TABLE transactions ALTER COLUMN source SET DEFAULT 'mono'")
    _source_enum.drop(op.get_bind(), checkfirst=True)

    # ── 2. Restore transactions columns ───────────────────────────────────────
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(
            sa.Column("is_manual", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(sa.Column("interswitch_ref", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("mono_id", sa.Text(), nullable=True))

    # ── 1. Recreate pending_bill_payments (schema only — data is gone) ────────
    op.create_table(
        "pending_bill_payments",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("ref", sa.Text(), nullable=False),
        sa.Column("payment_code", sa.Text(), nullable=False),
        sa.Column("customer_id", sa.Text(), nullable=False),
        sa.Column("customer_email", sa.Text(), nullable=False, server_default=""),
        sa.Column("customer_mobile", sa.Text(), nullable=True),
        sa.Column("biller_name", sa.Text(), nullable=True),
        sa.Column("account_id", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Text(), nullable=True),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False, server_default="PENDING_CHECKOUT"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transaction_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
