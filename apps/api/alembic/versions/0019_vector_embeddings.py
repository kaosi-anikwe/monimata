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

"""vector embeddings

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-16

Phase 4 of the Automated Financial Categorisation System:

- Enable the pgvector Postgres extension.
- Add a VECTOR(384) column to user_category_rules for storing all-MiniLM-L6-v2
  embeddings of cleaned_narration.  Column is nullable — populated asynchronously
  by the embed_category_rule Celery task after rule creation.
- Add an IVFFlat cosine index on the embedding column for sub-linear ANN search
  once the table exceeds ~1,000 rows.  The index uses 10 lists; rebuild with
  more lists as data grows (rule of thumb: sqrt(n_rows)).
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector — idempotent if already present.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        """
        ALTER TABLE user_category_rules
        ADD COLUMN IF NOT EXISTS embedding vector(384)
        """
    )

    # IVFFlat index for approximate nearest-neighbour search by cosine distance.
    # Created with IF NOT EXISTS via raw SQL so repeated runs are safe.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_user_category_rules_embedding
        ON user_category_rules
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 10)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_category_rules_embedding")
    op.execute("ALTER TABLE user_category_rules DROP COLUMN IF EXISTS embedding")
    # Do not drop the extension — other tables or extensions may depend on it.
