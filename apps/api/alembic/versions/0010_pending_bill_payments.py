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

"""pending_bill_payments table

Tracks the 3-phase Interswitch Web Checkout → SendBillPaymentAdvice lifecycle.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-01
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pending_bill_payments",
        sa.Column("id", UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("ref", sa.Text(), nullable=False),
        sa.Column("payment_code", sa.Text(), nullable=False),
        sa.Column("customer_id", sa.Text(), nullable=False),
        sa.Column("customer_email", sa.Text(), nullable=False, server_default=""),
        sa.Column("customer_mobile", sa.Text(), nullable=True),
        sa.Column("biller_name", sa.Text(), nullable=True),
        sa.Column("account_id", UUID(as_uuid=False), nullable=False),
        sa.Column("category_id", UUID(as_uuid=False), nullable=True),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column(
            "state",
            sa.Text(),
            nullable=False,
            server_default="PENDING_CHECKOUT",
        ),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transaction_id", UUID(as_uuid=False), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["bank_accounts.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.UniqueConstraint("ref"),
    )
    op.create_index(
        "ix_pending_bill_payments_user_id", "pending_bill_payments", ["user_id"]
    )
    op.create_index("ix_pending_bill_payments_ref", "pending_bill_payments", ["ref"])
    op.create_index(
        "ix_pending_bill_payments_state", "pending_bill_payments", ["state"]
    )


def downgrade() -> None:
    op.drop_index("ix_pending_bill_payments_state", table_name="pending_bill_payments")
    op.drop_index("ix_pending_bill_payments_ref", table_name="pending_bill_payments")
    op.drop_index(
        "ix_pending_bill_payments_user_id", table_name="pending_bill_payments"
    )
    op.drop_table("pending_bill_payments")
