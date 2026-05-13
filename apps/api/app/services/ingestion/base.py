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

"""
Core types for the bank data ingestion system.

``ParsedTransaction`` is the channel-agnostic output produced by every
parser, regardless of whether the source was an email alert, an uploaded
statement, a forwarded receipt, or any future channel.

``EmailBankParser`` is the Protocol every bank-specific email parser must
satisfy.  Adding a new bank for the email channel means implementing this
Protocol and registering it via ``registry.register_email_parser()``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass
class ParsedTransaction:
    """Channel-agnostic transaction extracted from any ingestion source."""

    transaction_type: str  # "credit" | "debit"
    amount_kobo: int
    account_last4: str | None
    balance_kobo: int | None
    narration: str | None
    sender_email: str | None  # for email channel: the From address; filled in by dispatcher
    # Bank-issued reference — used for idempotent upsert / dedup.
    transaction_ref: str | None = field(default=None)
    # Timestamp extracted from the alert body (already converted to UTC).
    # Falls back to datetime.now(UTC) at insert time if absent.
    transaction_date: datetime | None = field(default=None)


class EmailBankParser(Protocol):
    """
    Protocol that every bank-specific email parser must satisfy.

    Implementing this Protocol is intentionally minimal: a single class
    with a ``sender_domains`` class attribute and a ``parse()`` method.

    ``sender_domains`` is the set of email domains that identify emails
    from this bank, e.g. ``frozenset({"gtbank.com"})``.  Routing is done
    exclusively by sender domain — no generic fallback exists.

    ``parse()`` receives the plain-text email body and returns a
    ``ParsedTransaction`` on success, or ``None`` if the body is from the
    right bank but in an unrecognised format (parser should log a warning
    in that case so we can add the new template).
    """

    sender_domains: frozenset[str]

    def parse(self, body: str) -> ParsedTransaction | None: ...
