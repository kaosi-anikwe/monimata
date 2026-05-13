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

"""encrypt plaintext account_numbers in bank_accounts

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-13
"""

from sqlalchemy import text

from alembic import op

revision: str = "0015"
down_revision: str = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.core.security import decrypt_pii, encrypt_pii

    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT id, account_number FROM bank_accounts WHERE account_number IS NOT NULL")
    ).fetchall()

    for row_id, account_number in rows:
        # Skip rows that are already encrypted (not a plain 10-digit string).
        if not (account_number.isdigit() and len(account_number) == 10):
            try:
                decrypt_pii(account_number)  # already valid ciphertext — skip
                continue
            except Exception:
                pass  # unrecognised format — encrypt anyway to fix it

        encrypted = encrypt_pii(account_number)
        conn.execute(
            text("UPDATE bank_accounts SET account_number = :enc WHERE id = :id"),
            {"enc": encrypted, "id": str(row_id)},
        )


def downgrade() -> None:
    from app.core.security import decrypt_pii

    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT id, account_number FROM bank_accounts WHERE account_number IS NOT NULL")
    ).fetchall()

    for row_id, account_number in rows:
        if account_number.isdigit() and len(account_number) == 10:
            continue  # already plaintext
        try:
            plaintext = decrypt_pii(account_number)
            conn.execute(
                text("UPDATE bank_accounts SET account_number = :plain WHERE id = :id"),
                {"plain": plaintext, "id": str(row_id)},
            )
        except Exception:
            pass  # can't decrypt — leave as-is
