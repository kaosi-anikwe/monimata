"""nudge_stats

Add ``rule_id`` FK to ``nudges`` and create the ``nudge_stats``
per-user per-rule daily metrics table.

Revision ID: 0025
Revises: 0024
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- nudge_stats table -----------------------------------------------------
    op.create_table(
        "nudge_stats",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "rule_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("nudge_rules.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("date_wat", sa.Date, nullable=False, index=True),
        sa.Column("hits", sa.Integer, nullable=False, server_default="0"),
        sa.Column("delivered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("suppressed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("opened", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dismissed", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "rule_id", "date_wat", name="uq_user_rule_date"),
    )

    # -- rule_id FK on nudges --------------------------------------------------
    op.add_column(
        "nudges",
        sa.Column(
            "rule_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("nudge_rules.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("nudges", "rule_id")
    op.drop_table("nudge_stats")
