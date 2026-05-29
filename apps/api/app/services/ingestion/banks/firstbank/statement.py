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

"""FirstBank (First Bank of Nigeria) statement parser — password-protected PDF.

FirstBank account statements are PDF files encrypted with a user password.
The password is the **last 5 digits** of the account number (e.g. account
``0067435395`` → password ``35395``).

Column layout (all transaction pages):
  TransDate | Reference | Transaction Details | ValueDate |
  Deposit   | Withdrawal | Balance

``Reference`` typically holds the bank-generated transaction reference (e.g.
``3167435395:Int.Pd:28-12-2025 to 27-01-2026`` for interest entries).  For
POS / transfer transactions the Reference column often contains the full
narrative text; ``Transaction Details`` may be empty or carry a continuation.

Deduplication: FirstBank statements do not provide a unique short reference
for every row.  A stable synthetic ``transaction_ref`` is generated from a
SHA-256 hash of ``(date, type, amount_kobo, balance_kobo, narration)`` so
that re-importing the same statement never creates duplicate rows.

Date format: ``DD-MON-YY`` (e.g. ``23-JAN-26``), two-digit year.
Python's ``%y`` rule maps 00-68 → 2000-2068.

Amount format: comma-separated thousands, two decimal places (e.g. ``2,100.00``).
"""

from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import pdfplumber

from app.services.ingestion.base import ParsedTransaction, StatementBankParser
from app.services.ingestion.channels.statement import register_statement_password_fn
from app.services.ingestion.registry import BankInfo, register_statement_parser

if TYPE_CHECKING:
    pass

# ── WAT (West Africa Time = UTC+1, no DST) ──────────────────────────────────
_WAT = timezone(timedelta(hours=1))

# ── Identity signals ─────────────────────────────────────────────────────────

# Keywords expected in the plain-text body of a FirstBank-forwarded email.
_EMAIL_IDENTITY_SIGNALS = frozenset(
    [
        "firstbanknigeria.com",
        "First Bank of Nigeria",
        "FirstBank",
        "firstcontact@firstbank",
    ]
)

# Minimum number of PDF keyword hits required to identify a FirstBank PDF
# when no email body signals are present.
_PDF_IDENTITY_KEYWORDS = frozenset(
    [
        "Account No",  # field label in the header summary
        "Opening Balance",  # field label
        "Closing Balance",  # field label
        "Total Debit",  # field label
        "Total Credit",  # field label
    ]
)

# Account number: 10-digit NUBAN that follows the "Account No:" label.
_ACCT_NUM_RE = re.compile(r"Account\s+No[:\s]+(\d{10})")

# ── Column layout ────────────────────────────────────────────────────────────
# FirstBank PDFs use no grid lines; every column is identified by the
# x-midpoint of each word.  Column x-edges (in PDF points) were measured
# from the header row of the statement (y ≈ 338.9 on page 1):
#
#   TransDate(61) | Reference(107) | Transaction Details(164) |
#   ValueDate(312) | Deposit(390) | Withdrawal(435) | Balance(510)
_COL_EDGES: list[float] = [52, 107, 164, 312, 390, 435, 510, 565]

_COL_TRANS_DATE = 0
_COL_REFERENCE = 1
_COL_DETAILS = 2
_COL_VALUE_DATE = 3
_COL_DEPOSIT = 4
_COL_WITHDRAWAL = 5
_COL_BALANCE = 6
_N_COLS = 7

# y-tolerance for grouping words into the same row.
_Y_TOL = 3.0

# Maximum y-distance (pts) to merge a continuation row into its anchor.
_MAX_MERGE = 30.0

# Crop boxes (x0, y0, x1, y1) used to skip non-transaction content.
# Page 1 has a caution block, account summary, table header, and a
# "Balance B/F" sentinel before the first real transaction row.
_CROP_P1 = (0, 362, 595, 842)
_CROP_REST = (0, 30, 595, 842)

# Anchor rows have a valid DD-MON-YY date in the TransDate cell.
_TRANS_DATE_RE = re.compile(r"^\d{2}-[A-Z]{3}-\d{2}$", re.IGNORECASE)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _col_index(x_mid: float) -> int | None:
    for i in range(len(_COL_EDGES) - 1):
        if _COL_EDGES[i] <= x_mid < _COL_EDGES[i + 1]:
            return i
    return None


def _extract_page_rows(
    words: list[dict],
) -> list[tuple[float, list[str]]]:
    """Group *words* into rows by y-coordinate; assign each word to a column.

    Returns ``[(y, [cell0…cell6]), …]`` sorted by ascending y.
    """
    y_buckets: dict[float, list[dict]] = {}
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        rk = next((k for k in y_buckets if abs(w["top"] - k) <= _Y_TOL), w["top"])
        y_buckets.setdefault(rk, []).append(w)

    result: list[tuple[float, list[str]]] = []
    for rk in sorted(y_buckets):
        row: list[str] = [""] * _N_COLS
        for w in y_buckets[rk]:
            x_mid = (w["x0"] + w["x1"]) / 2
            ci = _col_index(x_mid)
            if ci is not None:
                row[ci] = (row[ci] + " " + w["text"]).strip()
        result.append((rk, row))
    return result


def _merge_continuations(
    rows: list[tuple[float, list[str]]],
) -> list[list[str]]:
    """Merge continuation rows (no date in TransDate) into their nearest anchor.

    Only continuations that appear *below* an anchor and within *_MAX_MERGE*
    points are merged; orphaned continuations are dropped.
    """
    anchors: list[tuple[int, float]] = [
        (i, y)
        for i, (y, row) in enumerate(rows)
        if _TRANS_DATE_RE.match(row[_COL_TRANS_DATE].strip())
    ]
    if not anchors:
        return []

    result: dict[int, list[str]] = {ai: list(rows[ai][1]) for ai, _ in anchors}

    for _, (y, row) in enumerate(rows):
        if _TRANS_DATE_RE.match(row[_COL_TRANS_DATE].strip()) or not any(row):
            continue
        # Find the nearest anchor that is strictly above this continuation.
        above = [(ai, ay) for ai, ay in anchors if ay < y]
        if not above:
            continue
        ai, anchor_y = min(above, key=lambda a: y - a[1])
        if y - anchor_y > _MAX_MERGE:
            continue
        a_row = result[ai]
        for col in (_COL_REFERENCE, _COL_DETAILS):
            piece = row[col].strip()
            if piece:
                a_row[col] = (a_row[col] + " " + piece).strip()

    return [result[ai] for ai, _ in sorted(anchors, key=lambda a: a[1])]


def _naira_to_kobo(s: str) -> int | None:
    """Convert an amount string like ``'4,200.00'`` to integer kobo.

    Returns ``None`` for ``'--'``, empty strings, or unparseable input.
    """
    s = s.strip().replace(",", "")
    if s in ("--", ""):
        return None
    try:
        if "." in s:
            integer, decimal = s.split(".", 1)
            decimal = decimal.ljust(2, "0")[:2]
            return int(integer) * 100 + int(decimal)
        return int(s) * 100
    except (ValueError, AttributeError):
        return None


def _synthetic_ref(
    txn_date: datetime,
    txn_type: str,
    amount_kobo: int,
    balance_kobo: int | None,
    narration: str,
) -> str:
    """Return a stable dedup reference for a row that has no bank-issued ref.

    The hash is deterministic: the same statement imported twice always
    produces the same reference, preventing duplicate transaction rows.
    """
    key = f"{txn_date.date().isoformat()}|{txn_type}|{amount_kobo}|{balance_kobo}|{narration}"
    digest = hashlib.sha256(key.encode()).hexdigest()[:16]
    return f"firstbank-{digest}"


def _parse_row(
    row: list[str],
    account_last4: str | None,
) -> ParsedTransaction | None:
    """Convert a merged row into a ``ParsedTransaction``, or ``None`` to skip."""
    trans_date_str = row[_COL_TRANS_DATE].strip()
    if not trans_date_str:
        return None

    try:
        txn_date = datetime.strptime(trans_date_str, "%d-%b-%y").replace(tzinfo=_WAT)
    except ValueError:
        return None

    # Build narration from Reference + Transaction Details.
    ref_cell = row[_COL_REFERENCE].strip()
    details_cell = row[_COL_DETAILS].strip()
    narration_parts = [p for p in (ref_cell, details_cell) if p]
    narration = " ".join(narration_parts) or None

    deposit_k = _naira_to_kobo(row[_COL_DEPOSIT])
    withdrawal_k = _naira_to_kobo(row[_COL_WITHDRAWAL])
    balance_k = _naira_to_kobo(row[_COL_BALANCE])

    if deposit_k is not None:
        txn_type, amount = "credit", deposit_k
    elif withdrawal_k is not None:
        txn_type, amount = "debit", withdrawal_k
    else:
        return None

    ref = _synthetic_ref(txn_date, txn_type, amount, balance_k, narration or "")

    return ParsedTransaction(
        transaction_type=txn_type,
        amount_kobo=amount,
        account_last4=account_last4,
        balance_kobo=balance_k,
        narration=narration,
        sender_email=None,
        transaction_ref=ref,
        transaction_date=txn_date,
    )


def _extract_account_number(text: str) -> str | None:
    """Extract the 10-digit account number from a page's extracted text."""
    m = _ACCT_NUM_RE.search(text)
    return m.group(1) if m else None


# ── Parser ────────────────────────────────────────────────────────────────────


class _FirstBankStatementParser(StatementBankParser):
    def identify(
        self,
        content: bytes,
        email_body: str,
        password: str = "",
    ) -> tuple[str, str] | None:
        """Return ``(account_number, 'firstbank')`` if this is a FirstBank statement.

        Detection strategy:

        1. **Bank identity** — either the email body contains a FirstBank
           signal, OR the (unlocked) PDF page-1 text contains at least 3 of
           the known field-label keywords.
        2. **Account number** — extracted from the unlocked PDF page-1 header.
           Returns ``None`` if the PDF cannot be opened (wrong / missing password).
        """
        # 1a. Email-body check (fast path, no PDF open needed for identity).
        email_match = any(sig in email_body for sig in _EMAIL_IDENTITY_SIGNALS)

        # 1b. Open the PDF (with password if provided).
        try:
            open_kwargs: dict = {}
            if password:
                open_kwargs["password"] = password
            with pdfplumber.open(io.BytesIO(content), **open_kwargs) as pdf:
                page_text = pdf.pages[0].extract_text() or ""
        except Exception:
            return None

        # 1c. PDF keyword check when email gave no signal.
        if not email_match:
            hits = sum(1 for kw in _PDF_IDENTITY_KEYWORDS if kw in page_text)
            if hits < 3:
                return None

        # 2. Extract account number.
        account_number = _extract_account_number(page_text)
        if account_number is None:
            return None

        return (account_number, "firstbank")

    def parse(
        self,
        content: bytes,
        filename: str,
        password: str = "",
    ) -> list[ParsedTransaction]:
        """Parse a FirstBank statement PDF and return transactions oldest-first.

        Parameters
        ----------
        content:
            Raw PDF bytes.
        filename:
            Original filename (unused; kept for protocol compatibility).
        password:
            PDF decryption password.  For FirstBank this is the last 5 digits
            of the account number.  Pass ``""`` for an unencrypted PDF.
        """
        open_kwargs: dict = {}
        if password:
            open_kwargs["password"] = password

        try:
            with pdfplumber.open(io.BytesIO(content), **open_kwargs) as pdf:
                account_number = _extract_account_number(pdf.pages[0].extract_text() or "")
                account_last4 = account_number[-4:] if account_number else None

                results: list[ParsedTransaction] = []
                for page_idx, page in enumerate(pdf.pages):
                    crop_box = _CROP_P1 if page_idx == 0 else _CROP_REST
                    words = page.crop(crop_box).extract_words()
                    if not words:
                        continue
                    rows = _extract_page_rows(words)
                    for row in _merge_continuations(rows):
                        txn = _parse_row(row, account_last4)
                        if txn is not None:
                            results.append(txn)
        except Exception as exc:
            raise ValueError(f"Failed to parse FirstBank statement: {exc}") from exc

        # Sort oldest-first.
        results.sort(key=lambda t: t.transaction_date or datetime.max.replace(tzinfo=_WAT))
        return results


register_statement_parser(
    BankInfo(slug="firstbank", display_name="FirstBank"),
    _FirstBankStatementParser(),
)

# Register the password-derivation function so the upload router can unlock
# the PDF on behalf of the user without needing bank-specific knowledge.
register_statement_password_fn("firstbank", lambda acct_num: acct_num[-5:])
