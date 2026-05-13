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

"""Shared helpers used by all bank-specific parsers."""

from __future__ import annotations

import re
from datetime import timedelta, timezone
from decimal import Decimal, InvalidOperation

# West Africa Time — UTC+1, no DST.
WAT = timezone(timedelta(hours=1))

_AMOUNT_RE = re.compile(r"[\d,]+(?:\.\d{1,2})?")


def to_kobo(text: str | None) -> int | None:
    """Convert an amount string like '1,234.56' or '1234' to integer kobo.

    Returns ``None`` if ``text`` is absent or cannot be parsed.
    All amounts are in **kobo** (integer). ₦1,234.56 → 123456.
    """
    if not text:
        return None
    cleaned = text.replace(",", "").strip()
    try:
        return int(Decimal(cleaned) * 100)
    except (InvalidOperation, ValueError):
        return None
