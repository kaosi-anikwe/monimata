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

"""add nudge context/title and user fcm_token

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-13

Changes:
  nudges.title   — TEXT nullable: short notification title (e.g. "🚨 Food budget don finish!")
  nudges.context — JSONB nullable: structured payload for the detail view; schema varies by
                   trigger_type (see services/nudge_engine.py for per-type shapes).
  users.fcm_token — TEXT nullable: device push token; either an Expo push token
                    ("ExponentPushToken[...]") or a native FCM registration token.
                    Stored on device-registration (POST /nudges/register-device).
                    NULL means the user has not granted notification permissions.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── nudges: add title + context ───────────────────────────────────────────
    op.add_column(
        "nudges",
        sa.Column("title", sa.Text(), nullable=True),
    )
    op.add_column(
        "nudges",
        sa.Column(
            "context",
            JSONB(),
            nullable=True,
            server_default="{}",
        ),
    )

    # ── users: add fcm_token ──────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("fcm_token", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("nudges", "title")
    op.drop_column("nudges", "context")
    op.drop_column("users", "fcm_token")
