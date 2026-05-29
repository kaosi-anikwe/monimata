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

"""First Bank of Nigeria email alert parser.

Two alert layouts are supported:

Auto-forwarded (plain-text template, label: value on the same line)::

    Date/Time: 28-May-26 06:41 PM
    Account: 316XXXX395
    Amount: 200.00 CR
    Narration: PA:UP044011260528184125000013/ACCOUNT NAME
    Cleared Balance: NGN16,079.43 CR
    Uncleared Balance: NGN0.00 CR

Manually forwarded (HTML table rendered as plain text, label on one line
then an optional blank line then the value)::

    Date/Time

    28-May-26 05:42 PM

    Account Number

    316XXXX395

    Amount

    1,000.00 CR

    Narration

    CPWInward:100004260528164225161107719235/KAOSISOCH

    Cleared Balance

    NGN16,100.93 CR

Transaction type is encoded in the Amount value: ``200.00 CR`` (credit)
or ``500.00 DR`` (debit).  Balance is prefixed with ``NGN``.

Sender domain: firstbanknigeria.com
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.services.ingestion._utils import WAT, to_kobo
from app.services.ingestion.base import EmailBankParser, ParsedTransaction
from app.services.ingestion.registry import BankInfo, register_email_parser

# Matches the amount and CR/DR direction embedded in the Amount field.
# e.g. "200.00 CR", "1,000.00 CR", "500.00 DR"
_AMOUNT_KIND_RE = re.compile(
    r"(?P<amount>[\d,]+(?:\.\d{1,2})?)\s+(?P<kind>CR|DR)",
    re.IGNORECASE,
)

# Extracts the numeric balance from a value like "NGN16,079.43 CR".
_BALANCE_RE = re.compile(
    r"NGN\s*(?P<balance>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)

# Trailing digit run used to recover the last-4 from a masked account number
# like "316XXXX395".
_TRAIL_DIGITS_RE = re.compile(r"(\d+)$")

# Extracts the bank-issued reference embedded in FirstBank narration strings.
# e.g. "PA:UP044011260528184125000013/ACCOUNT NAME"  → UP044011260528184125000013
#      "CPWInward:100004260528164225161107719235/ACCOUNTNAME" → 100004260528164225161107719235
_NARRATION_REF_RE = re.compile(r":[A-Za-z0-9]*([A-Za-z0-9]+)/")


def _get_field(label: str, body: str) -> str | None:
    """Extract a field value from either FirstBank alert layout.

    Layout 1 — value on the same line after a colon (auto-forwarded)::

        Account: 316XXXX395

    Layout 2 — label on its own line, value on the next non-blank line
    (manually forwarded HTML table)::

        Account Number

        316XXXX395
    """
    escaped = re.escape(label)
    # Layout 1: "Label: Value"
    m = re.search(
        rf"^[ \t]*{escaped}:[ \t]+([^\n]+?)[ \t]*$",
        body,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        return m.group(1).strip() or None
    # Layout 2: "Label\n(blank lines)\nValue"
    m = re.search(
        rf"^[ \t]*{escaped}[ \t]*\n(?:[ \t]*\n)*[ \t]*([^\n]+?)[ \t]*$",
        body,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        return m.group(1).strip() or None
    return None


def _parse_date(text: str) -> datetime | None:
    """Parse FirstBank date strings: '28-May-26 06:41 PM' → UTC datetime."""
    # Both 2-digit (%y) and 4-digit (%Y) year variants are attempted.
    for fmt in ("%d-%b-%y %I:%M %p", "%d-%b-%Y %I:%M %p"):
        try:
            dt = datetime.strptime(text.strip(), fmt)
            return dt.replace(tzinfo=WAT).astimezone(UTC)
        except ValueError:
            continue
    return None


class _FirstBankEmailParser(EmailBankParser):
    sender_domains: frozenset[str] = frozenset({"firstbanknigeria.com"})

    def parse(self, body: str) -> ParsedTransaction | None:
        # Amount field encodes both the value and the transaction direction.
        amount_raw = _get_field("Amount", body)
        if not amount_raw:
            return None

        m = _AMOUNT_KIND_RE.search(amount_raw)
        if not m:
            return None

        amount_kobo = to_kobo(m.group("amount"))
        if amount_kobo is None:
            return None

        txn_type = "credit" if m.group("kind").upper() == "CR" else "debit"

        # Account number is masked, e.g. "316XXXX395".  Attempt "Account Number"
        # first (manual layout) then the shorter "Account" (auto layout).
        acct_raw = _get_field("Account Number", body) or _get_field("Account", body)
        account_last4: str | None = None
        if acct_raw:
            trail = _TRAIL_DIGITS_RE.search(acct_raw)
            if trail:
                account_last4 = trail.group(1)[-4:]

        # Narration — raw bank narration string, kept as-is.
        narration = _get_field("Narration", body)

        # Transaction ref — alphanumeric token between ":" and "/" in the narration.
        transaction_ref: str | None = None
        if narration:
            ref_m = _NARRATION_REF_RE.search(narration)
            if ref_m:
                transaction_ref = ref_m.group(0)[1:-1]  # strip leading ":" and trailing "/"

        # Cleared Balance, e.g. "NGN16,079.43 CR" — strip prefix and direction.
        balance_kobo: int | None = None
        balance_raw = _get_field("Cleared Balance", body)
        if balance_raw:
            bm = _BALANCE_RE.search(balance_raw)
            if bm:
                balance_kobo = to_kobo(bm.group("balance"))

        # Date/Time, e.g. "28-May-26 06:41 PM".
        date_raw = _get_field("Date/Time", body)
        transaction_date = _parse_date(date_raw) if date_raw else None

        return ParsedTransaction(
            transaction_type=txn_type,
            amount_kobo=amount_kobo,
            account_last4=account_last4,
            balance_kobo=balance_kobo,
            narration=narration,
            sender_email=None,
            transaction_ref=transaction_ref,
            transaction_date=transaction_date,
        )


register_email_parser(
    BankInfo(slug="firstbank", display_name="First Bank"),
    _FirstBankEmailParser(),
)
