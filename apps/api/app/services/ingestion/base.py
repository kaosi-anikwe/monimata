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

``EmailBankParser``     — Protocol for email alert parsers.
``StatementBankParser`` — Protocol for bank statement parsers (PDF/CSV upload
                          or forwarded statement).  Returns a list because a
                          statement contains multiple transactions.
``ReceiptBankParser``   — Protocol for transaction receipt parsers (image/PDF
                          shared to the app).  OCR is performed upstream by
                          the channel dispatcher; the parser receives plain
                          text.  Returns a single transaction.
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

    ``sender_domains`` — set of email domains that identify this bank's
        alert emails.  Routing is done exclusively by sender domain.

    ``parse(body)`` — receives the plain-text email body; returns a
        ``ParsedTransaction`` on success, or ``None`` if the template is
        unrecognised (log a warning so the new template can be added).
    """

    sender_domains: frozenset[str]

    def parse(self, body: str) -> ParsedTransaction | None: ...


class StatementBankParser(Protocol):
    """
    Protocol that every bank-specific statement parser must satisfy.

    ``identify(content, email_body)`` — given raw file bytes and the
        optional forwarding email body, returns ``(account_number, bank_slug)``
        if the file is recognised as belonging to this bank, or ``None``
        otherwise.  Used to auto-detect the bank when a statement is
        forwarded by email.  ``email_body`` may be an empty string if the
        attachment was uploaded directly.

    ``parse(content, filename)`` — receives the raw file bytes and the
        original filename (used to distinguish PDF from CSV).  Returns a
        list of ``ParsedTransaction`` objects extracted from the statement,
        ordered oldest-first.  Returns an empty list if the file is
        structurally valid but contains no transactions.  Raises
        ``ValueError`` if the file format is unrecognised or corrupt.
    """

    def identify(self, content: bytes, email_body: str) -> tuple[str, str] | None: ...
    def parse(self, content: bytes, filename: str) -> list[ParsedTransaction]: ...


class ReceiptBankParser(Protocol):
    """
    Protocol that every bank-specific receipt parser must satisfy.

    Each parser is fully self-contained: it performs its own OCR from raw
    image bytes, so different banks can use different preprocessing or OCR
    configs without the channel dispatcher knowing.  The shared
    ``extract_text()`` utility in ``channels.receipt`` is available for parsers
    that want a sensible default (greyscale + 2× upscale + Tesseract).

    ``identify(image_bytes)`` — OCR the image; if it looks like this bank's
        receipt, return a list of account-number suffixes extracted from all
        phone numbers visible on the receipt (full numbers contribute their
        last 4 digits; masked numbers contribute the digits after the
        asterisks).  Both the user’s number and the counterparty’s number
        appear on the receipt; returning all candidates lets the task try
        each against the user’s accounts and use ``parse()`` as the final
        disambiguator.  Return ``None`` if the image is not recognised as
        this bank’s receipt.

    ``parse(image_bytes, account_number)`` — OCR the image and extract the
        transaction.  ``account_number`` is the user’s full decrypted account
        number, used to determine credit vs. debit direction.  Returns a
        ``ParsedTransaction`` on success, or ``None`` if parsing fails.
    """

    def identify(self, image_bytes: bytes) -> list[str] | None: ...
    def parse(self, image_bytes: bytes, account_number: str) -> ParsedTransaction | None: ...
