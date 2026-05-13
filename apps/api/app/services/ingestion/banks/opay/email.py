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

"""OPay email alert parser.

OPay alert emails are sent from no-reply@opay-nigeria.com.

Gmail plain-text forwarding wraps bold HTML spans in asterisks, e.g.
``*₦1,850.00*``.  Patterns are written to handle the asterisks.

Debit template:
    Your transfer of *₦1,234.56* is successful
    ...
    Your available balance is *₦5,000.00*
    Transaction No.: *ABC123456*
    Transaction Date: *May 12th, 2026 11:34:04*
    Name: *RITA AYOGU*
    Bank: *Access Bank*

Credit template:
    *₦1,234.56* has been credited ...
    Your available balance is *₦5,000.00*
    Transaction No.: *ABC123456*
    Transaction Date: *May 12th, 2026 11:34:04*

Sender domain: opay-nigeria.com
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.services.ingestion._utils import WAT, to_kobo
from app.services.ingestion.base import EmailBankParser, ParsedTransaction
from app.services.ingestion.registry import BankInfo, register_email_parser

_DEBIT_RE = re.compile(
    r"Your transfer of\s*\*?₦(?P<amount>[\d,]+(?:\.\d{1,2})?)\*?\s+is successful"
    r".*?available balance is[\s\n]*\*?₦(?P<balance>[\d,]+(?:\.\d{1,2})?)\*?",
    re.IGNORECASE | re.DOTALL,
)
_CREDIT_RE = re.compile(
    r"\*?₦(?P<amount>[\d,]+(?:\.\d{1,2})?)\*?\s+has been credited.*?"
    r"available balance is[\s\n]*\*?₦(?P<balance>[\d,]+(?:\.\d{1,2})?)\*?",
    re.IGNORECASE | re.DOTALL,
)


def _get_field(label: str, body: str) -> str | None:
    """Extract the value for *label* from an OPay email body.

    Handles two layouts produced by different forwarding methods:

    Inline (plain-text forwarded):
        Name: *ACCOUNT NAME*
        Name: ACCOUNT NAME

    Next-line (HTML-extracted, auto-forwarded):
        Name:
            ACCOUNT NAME
    """
    escaped = re.escape(label)
    # Layout 1 — value on the same line, optional asterisk bold markers.
    m = re.search(
        rf"^[ \t]*{escaped}:\s*\*?([^*\n]+?)\*?\s*$",
        body,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        return m.group(1).strip() or None
    # Layout 2 — label line ends with optional whitespace, value on next line.
    m = re.search(
        rf"^[ \t]*{escaped}:[ \t]*\n[ \t]+([^\n]+?)\s*$",
        body,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        return m.group(1).strip() or None
    return None


def _parse_date(text: str) -> datetime | None:
    """Parse OPay date strings: 'May 12th, 2026 11:34:04' → UTC-aware datetime."""
    # Strip ordinal suffixes (1st, 2nd, 3rd, …, 31st).
    cleaned = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text.strip())
    for fmt in ("%B %d, %Y %H:%M:%S", "%B %d %Y %H:%M:%S"):
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(tzinfo=WAT).astimezone(UTC)
        except ValueError:
            continue
    return None


class _OPayEmailParser(EmailBankParser):
    sender_domains: frozenset[str] = frozenset({"opay-nigeria.com"})

    def parse(self, body: str) -> ParsedTransaction | None:
        # ── Debit: outgoing transfer ─────────────────────────────────────────
        m = _DEBIT_RE.search(body)
        if m:
            amount_kobo = to_kobo(m.group("amount"))
            if amount_kobo is None:
                return None

            name_m = _get_field("Name", body)
            bank_m = _get_field("Bank", body)
            recipient_name = name_m
            recipient_bank = bank_m

            if recipient_name:
                narration = recipient_name
            elif recipient_bank:
                narration = f"Transfer to {recipient_bank}"
            else:
                narration = "OPay Transfer"

            transaction_ref = _get_field("Transaction No.", body)
            date_raw = _get_field("Transaction Date", body)
            return ParsedTransaction(
                transaction_type="debit",
                amount_kobo=amount_kobo,
                account_last4=None,  # OPay does not expose the user's account number
                balance_kobo=to_kobo(m.group("balance")),
                narration=narration,
                sender_email=None,
                transaction_ref=transaction_ref,
                transaction_date=_parse_date(date_raw) if date_raw else None,
            )

        # ── Credit: incoming transfer ────────────────────────────────────────
        m = _CREDIT_RE.search(body)
        if m:
            amount_kobo = to_kobo(m.group("amount"))
            if amount_kobo is None:
                return None

            transaction_ref = _get_field("Transaction No.", body)
            date_raw = _get_field("Transaction Date", body)
            return ParsedTransaction(
                transaction_type="credit",
                amount_kobo=amount_kobo,
                account_last4=None,
                balance_kobo=to_kobo(m.group("balance")),
                narration="OPay Credit",
                sender_email=None,
                transaction_ref=transaction_ref,
                transaction_date=_parse_date(date_raw) if date_raw else None,
            )

        return None


register_email_parser(
    BankInfo(slug="opay", display_name="OPay"),
    _OPayEmailParser(),
)
