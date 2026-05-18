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

"""budget_month schema v2: month Date, add carried_over

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-18

Two structural changes to budget_months:

1. month column: String(7) "YYYY-MM" → Date (first of month)
   Native B-Tree range queries replace string comparisons.  All application
   code normalises this value to the 1st day of the month (e.g. 2026-05-01).

2. carried_over column: new BigInteger
   Stores the closing available balance from the previous month, pre-computed
   at month-initialisation time.  Eliminates recursive prev-month queries on
   every budget page load and is the foundation for the lazy rollover engine.

Back-fill strategy for carried_over:
   For each existing row, look up the immediate predecessor row for the same
   (user, category) pair and set carried_over = GREATEST(0, prev.assigned +
   prev.activity).  Rows with no predecessor default to 0.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add carried_over (nullable during back-fill) ───────────────────
    op.add_column(
        "budget_months",
        sa.Column("carried_over", sa.BigInteger(), nullable=True),
    )

    # ── 2. Add a temporary Date column alongside the existing String column ─
    op.add_column(
        "budget_months",
        sa.Column("month_new", sa.Date(), nullable=True),
    )

    # ── 3. Back-fill: convert "YYYY-MM" string → first-of-month Date ─────
    op.execute("UPDATE budget_months SET month_new = to_date(month || '-01', 'YYYY-MM-DD')")

    # ── 4. Drop the unique constraint that references the old string column ─
    op.drop_constraint("uq_budget_months_user_cat_month", "budget_months", type_="unique")

    # ── 5. Drop the old String(7) month column ────────────────────────────
    op.drop_column("budget_months", "month")

    # ── 6. Rename the populated Date column into place ────────────────────
    op.alter_column("budget_months", "month_new", new_column_name="month")

    # ── 7. Enforce NOT NULL on the renamed column ─────────────────────────
    op.alter_column("budget_months", "month", nullable=False)

    # ── 8. Re-create the unique constraint on the Date column ─────────────
    op.create_unique_constraint(
        "uq_budget_months_user_cat_month",
        "budget_months",
        ["user_id", "category_id", "month"],
    )

    # ── 9. B-Tree index on month for native range queries ─────────────────
    op.create_index("ix_budget_months_month", "budget_months", ["month"])

    # ── 10. Back-fill carried_over from predecessor row's closing available ─
    # carried_over = GREATEST(0, prev.assigned + prev.activity)
    # Rows whose predecessor is exactly one calendar month prior are matched
    # via (bm.month - INTERVAL '1 month')::date.
    op.execute(
        """
        UPDATE budget_months bm
        SET carried_over = GREATEST(0, (
            SELECT prev.assigned + prev.activity
            FROM budget_months prev
            WHERE prev.user_id    = bm.user_id
              AND prev.category_id = bm.category_id
              AND prev.month = (bm.month - INTERVAL '1 month')::date
        ))
        WHERE EXISTS (
            SELECT 1 FROM budget_months prev
            WHERE prev.user_id    = bm.user_id
              AND prev.category_id = bm.category_id
              AND prev.month = (bm.month - INTERVAL '1 month')::date
        )
        """
    )

    # ── 11. Rows with no predecessor: default to 0 ────────────────────────
    op.execute("UPDATE budget_months SET carried_over = 0 WHERE carried_over IS NULL")

    # ── 12. Set NOT NULL + server default on carried_over ────────────────
    op.alter_column(
        "budget_months",
        "carried_over",
        nullable=False,
        server_default="0",
    )


def downgrade() -> None:
    op.drop_index("ix_budget_months_month", table_name="budget_months")
    op.drop_constraint("uq_budget_months_user_cat_month", "budget_months", type_="unique")

    # Add a temporary String column to hold the formatted values
    op.add_column(
        "budget_months",
        sa.Column("month_str", sa.String(7), nullable=True),
    )
    op.execute("UPDATE budget_months SET month_str = to_char(month, 'YYYY-MM')")

    op.drop_column("budget_months", "carried_over")
    op.drop_column("budget_months", "month")

    op.alter_column("budget_months", "month_str", new_column_name="month")
    op.alter_column("budget_months", "month", nullable=False)

    op.create_unique_constraint(
        "uq_budget_months_user_cat_month",
        "budget_months",
        ["user_id", "category_id", "month"],
    )
