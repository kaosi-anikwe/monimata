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

"""Add updated_at to category_groups and categories for incremental WatermelonDB sync.

Existing rows are back-filled with their created_at value so that the first sync
after this migration returns all categories/groups as "updated" rather than broken.

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── category_groups ───────────────────────────────────────────────────────
    op.add_column(
        "category_groups",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,  # nullable first so the ADD COLUMN succeeds on existing rows
        ),
    )
    # Back-fill: use created_at as a safe baseline for existing rows
    op.execute(
        "UPDATE category_groups SET updated_at = created_at WHERE updated_at IS NULL"
    )
    # Now tighten to NOT NULL
    op.alter_column("category_groups", "updated_at", nullable=False)

    # ── categories ────────────────────────────────────────────────────────────
    op.add_column(
        "categories",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.execute("UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column("categories", "updated_at", nullable=False)


def downgrade() -> None:
    op.drop_column("categories", "updated_at")
    op.drop_column("category_groups", "updated_at")
