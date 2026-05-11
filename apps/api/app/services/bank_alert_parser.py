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
Regex-based parser for Nigerian bank debit/credit alert emails.

Supported banks (pattern coverage):
  GTBank, Access Bank, UBA, First Bank, Zenith Bank, Kuda, Opay, Sterling

Returns a ParsedBankAlert dataclass on success, None if no pattern matches.
All amounts are in **kobo** (integer). ₦1,234.56 → 123456.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass
class ParsedBankAlert:
    transaction_type: str  # "credit" | "debit"
    amount_kobo: int
    account_last4: str | None
    balance_kobo: int | None
    narration: str | None
    sender_email: str | None  # filled in by the caller from message.from


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_AMOUNT_RE = re.compile(r"[\d,]+(?:\.\d{1,2})?")


def _to_kobo(text: str) -> int | None:
    """Convert an amount string like '1,234.56' or '1234' to kobo."""
    cleaned = text.replace(",", "").strip()
    try:
        return int(Decimal(cleaned) * 100)
    except (InvalidOperation, ValueError):
        return None


def _first_amount(text: str) -> int | None:
    m = _AMOUNT_RE.search(text)
    return _to_kobo(m.group()) if m else None


# ---------------------------------------------------------------------------
# Per-bank patterns
# Each entry: (compiled regex, transaction_type, group names)
# Required named groups: amount
# Optional named groups: acct, balance, narration
# ---------------------------------------------------------------------------

_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # ── GTBank ──────────────────────────────────────────────────────────────
    # "Acct:0123456789; Cr:N1,234.56; Desc:POS/ATM; Bal:N5,000.00"
    (
        re.compile(
            r"Acct:(?P<acct>\d+);\s*Cr:N(?P<amount>[\d,]+(?:\.\d{1,2})?);"
            r".*?Bal:N(?P<balance>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE | re.DOTALL,
        ),
        "credit",
    ),
    (
        re.compile(
            r"Acct:(?P<acct>\d+);\s*Dr:N(?P<amount>[\d,]+(?:\.\d{1,2})?);"
            r".*?Bal:N(?P<balance>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE | re.DOTALL,
        ),
        "debit",
    ),
    # ── Access Bank ─────────────────────────────────────────────────────────
    # "Your Acct ...XXXX has been credited with NGN 1,234.56 on ..."
    (
        re.compile(
            r"Acct\s+\*+(?P<acct>\d{4})\s+has been credited with\s+NGN"
            r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "credit",
    ),
    (
        re.compile(
            r"Acct\s+\*+(?P<acct>\d{4})\s+has been debited with\s+NGN"
            r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "debit",
    ),
    # ── UBA ─────────────────────────────────────────────────────────────────
    # "Acct:XXXXXXXXXX. Credit Alert of NGN1,234.56"
    (
        re.compile(
            r"Acct:(?P<acct>\d+)\.\s*Credit Alert of NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "credit",
    ),
    (
        re.compile(
            r"Acct:(?P<acct>\d+)\.\s*Debit Alert of NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "debit",
    ),
    # ── First Bank ──────────────────────────────────────────────────────────
    # "Credit: A/C:XXXXXXXXXX|Amt: NGN 1,234.56|Desc:..."
    (
        re.compile(
            r"Credit:\s*A/C:(?P<acct>\d+)\|Amt:\s*NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)"
            r"(?:\|Desc:(?P<narration>[^|]+))?",
            re.IGNORECASE,
        ),
        "credit",
    ),
    (
        re.compile(
            r"Debit:\s*A/C:(?P<acct>\d+)\|Amt:\s*NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)"
            r"(?:\|Desc:(?P<narration>[^|]+))?",
            re.IGNORECASE,
        ),
        "debit",
    ),
    # ── Zenith Bank ─────────────────────────────────────────────────────────
    # "Your account XXXXXXXX has been credited with the sum of NGN 1,234.56"
    (
        re.compile(
            r"account\s+(?P<acct>\d+)\s+has been credited with the sum of\s+NGN"
            r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "credit",
    ),
    (
        re.compile(
            r"account\s+(?P<acct>\d+)\s+has been debited with the sum of\s+NGN"
            r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "debit",
    ),
    # ── Generic fallback (any NGN credit / debit mention) ───────────────────
    (
        re.compile(
            r"(?:credited|credit\s+alert)[^\n]*?NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "credit",
    ),
    (
        re.compile(
            r"(?:debited|debit\s+alert)[^\n]*?NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
            re.IGNORECASE,
        ),
        "debit",
    ),
]


def parse_bank_alert(body: str) -> ParsedBankAlert | None:
    """
    Attempt to extract a transaction from a bank alert email body.

    Returns a ParsedBankAlert on success, or None if no pattern matches
    (caller should log a Sentry warning in that case).
    """
    if not body:
        return None

    for pattern, txn_type in _PATTERNS:
        m = pattern.search(body)
        if not m:
            continue

        groups = m.groupdict()
        amount_kobo = _to_kobo(groups["amount"])
        if amount_kobo is None:
            continue

        acct_raw = groups.get("acct")
        account_last4 = acct_raw[-4:] if acct_raw else None

        balance_raw = groups.get("balance")
        balance_kobo = _to_kobo(balance_raw) if balance_raw else None

        narration = (groups.get("narration") or "").strip() or None

        return ParsedBankAlert(
            transaction_type=txn_type,
            amount_kobo=amount_kobo,
            account_last4=account_last4,
            balance_kobo=balance_kobo,
            narration=narration,
            sender_email=None,  # set by caller
        )

    return None
