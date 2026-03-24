"""rename users.fcm_token to expo_push_token

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-13
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "fcm_token", new_column_name="expo_push_token")


def downgrade() -> None:
    op.alter_column("users", "expo_push_token", new_column_name="fcm_token")
