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

"""OPay bank statement parser — PDF (pdfplumber coordinate extraction).

OPay account statements are multi-page PDFs with a fixed table layout.
Pages use two different column-position variants (Layout A / Layout B),
detected per-row via the x-position of the "Mobile" channel token.

Layout A (main Wallet Account) takes precedence.  Layout B rows (OWealth
savings sub-account) are included only when their transaction_ref has not
already been seen in Layout A; if a ref appears in both, Layout A wins.

Column layout A — debit before credit
  col_edges  : [62, 125, 169, 283, 328, 369, 409, 457, 545]
  columns    : trans_time | value_date | description |
               debit | credit | balance_after | channel | transaction_ref

Column layout B — debit before credit (same order as A, narrower columns)
  col_edges  : [62, 130, 181, 248, 289, 334, 382, 436, 545]
  columns    : trans_time | value_date | description |
               debit | credit | balance_after | channel | transaction_ref

Multi-line rows: description and transaction_ref sometimes wrap onto
continuation lines.  Continuation rows (empty trans_time) are merged into
the nearest anchor row (by y-distance), up to MAX_MERGE_DIST points away.
"""

from __future__ import annotations

import io
import re
from datetime import datetime, timedelta, timezone
from typing import TypedDict

import pdfplumber

from app.services.ingestion.base import ParsedTransaction, StatementBankParser
from app.services.ingestion.registry import BankInfo, register_statement_parser

# ── OPay statement identification signals ───────────────────────────────────
# Keywords that identify an OPay account statement PDF (page 1 text).
# "Wallet Account" is OPay-specific; combined with "Account Statement" it is
# sufficient to distinguish this PDF from other banks without relying on the
# logo image (which is not extractable as text).
_PDF_IDENTITY_KEYWORDS = frozenset(
    [
        "Wallet Account",
        "Account Statement",
    ]
)

# Keywords / domain fragments that identify an OPay forwarding email body.
_EMAIL_IDENTITY_SIGNALS = frozenset(
    [
        "opay-nigeria.com",
        "opay-inc.com",
        "OPay Digital Services",
        "...Beyond Banking",
    ]
)

# Account Number label on page 1; the 10-digit value follows immediately.
_ACCT_NUM_RE = re.compile(r"Account\s+Number[\s\S]{0,60}?(\d{10})")


def _extract_account_number_from_pdf(content: bytes) -> str | None:
    """Read page 1 of the PDF and extract the 10-digit OPay account number.

    The summary block on page 1 contains::

        Account Name      Account Number
        JOHN DOE          9012345678

    We crop to the header region (Y: 99–330), join all extracted text, and
    match the 10-digit number that follows "Account Number".
    """
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            page = pdf.pages[0]
            # Crop to the summary block above the transaction table.
            header = page.crop((0, 99, 612, 330))
            text = header.extract_text() or ""
            m = _ACCT_NUM_RE.search(text)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


# ── WAT (West Africa Time = UTC+1, no DST) ──────────────────────────────────
_WAT = timezone(timedelta(hours=1))

# ── column layout definitions ────────────────────────────────────────────────


class _Layout(TypedDict):
    col_edges: list[float]
    trans_time: int
    value_date: int
    description: int
    debit: int
    credit: int
    balance_after: int
    channel: int
    transaction_ref: int


# Layout A: used for main Wallet Account pages (Mobile x0 ≈ 420.79)
_LAYOUT_A: _Layout = {
    "col_edges": [62, 125, 169, 283, 328, 369, 409, 457, 545],
    "trans_time": 0,
    "value_date": 1,
    "description": 2,
    "debit": 3,
    "credit": 4,
    "balance_after": 5,
    "channel": 6,
    "transaction_ref": 7,
}

# Layout B: used for OWealth savings sub-account pages (Mobile x0 ≈ 396.75).
# The OWealth table uses the same debit | credit column ORDER as Layout A,
# just with narrower column edges (the "Mobile" channel word lands at x≈397
# instead of ≈421, which is how we detect Layout B rows).
_LAYOUT_B: _Layout = {
    "col_edges": [62, 130, 181, 248, 289, 334, 382, 436, 545],
    "trans_time": 0,
    "value_date": 1,
    "description": 2,
    "debit": 3,
    "credit": 4,
    "balance_after": 5,
    "channel": 6,
    "transaction_ref": 7,
}

# Narration prefixes that represent internal OPay wallet ↔ OWealth transfers.
# These entries appear in both the Wallet and OWealth sections and cancel out;
# importing them would inflate both sides of the ledger.
# Also covers Spend & Save sub-account churn within OWealth, and orphaned
# "(Transaction Payment)" continuation fragments that arise when a multi-line
# OWealth Withdrawal row is split across a page boundary.
_OPAY_INTERNAL_RE = re.compile(
    r"^(OWealth Withdrawal|Auto-save to OWealth|Spend & Save|OWealth Deposit"
    r"|\(Transaction Payment\)"
    r"|Balance)",  # OWealth auto-deposit mirrored from wallet, labeled "Balance" by OPay
    re.IGNORECASE,
)

# OWealth (Savings Account) closing-balance extractor.
# The per-section summary on the first OWealth page reads:
#   Savings Account Period: ...
#   Closing Balance  Total Credit  Credit Count
#   ₦9,697.05  ...
_OWEALTH_CLOSING_RE = re.compile(
    r"Savings Account.*?Closing Balance[^\n]*\n(₦[\d,]+\.\d{2})",
    re.DOTALL,
)


def _extract_owealth_closing_kobo(content: bytes) -> int | None:
    """Return the OWealth (Savings Account) closing balance in kobo.

    Scans every PDF page for the section summary block that contains
    ``Savings Account ... Closing Balance`` and extracts the ₦-prefixed amount
    on the following line.
    """
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                m = _OWEALTH_CLOSING_RE.search(text)
                if m:
                    amount_str = m.group(1).replace("₦", "").replace(",", "")
                    return _naira_to_kobo(amount_str)
    except Exception:
        pass
    return None


# Crop boxes: (x0, y0, x1, y1) in PDF points (72 dpi)
# Page 1 has a summary block above the data table; skip it.
_CROP_P1 = (0, 347, 612, 760)
_CROP_REST = (0, 30, 612, 760)

# Maximum y-distance (pts) for merging a continuation row into its anchor.
_MAX_MERGE = 40.0

# y-tolerance for grouping words into the same row
_Y_TOL = 3.0


# ── helpers ──────────────────────────────────────────────────────────────────


def _col_index(x_mid: float, edges: list[float]) -> int | None:
    for i in range(len(edges) - 1):
        if edges[i] <= x_mid < edges[i + 1]:
            return i
    return None


def _extract_page(
    words: list[dict],
) -> list[tuple[float, list[str], _Layout]]:
    """Group words into rows; detect layout per-row via 'Mobile' x-position.

    Returns a list of ``(y, row_cells, layout)`` tuples sorted by y.
    """
    # 1. Bucket words by y-coordinate
    y_buckets: dict[float, list[dict]] = {}
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        rk = next(
            (k for k in y_buckets if abs(w["top"] - k) <= _Y_TOL),
            w["top"],
        )
        y_buckets.setdefault(rk, []).append(w)

    # 2. Build mobile_map: row_y → layout (from "Mobile" word in that row)
    mobile_map: dict[float, _Layout] = {}
    for rk, wds in y_buckets.items():
        for w in wds:
            if w["text"] == "Mobile":
                mobile_map[rk] = _LAYOUT_B if w["x0"] < 410 else _LAYOUT_A
                break

    def _layout_for(y: float) -> _Layout:
        if not mobile_map:
            return _LAYOUT_A
        return mobile_map[min(mobile_map, key=lambda k: abs(k - y))]

    # 3. Assign words to columns using the per-row layout
    result: list[tuple[float, list[str], _Layout]] = []
    for rk in sorted(y_buckets):
        layout = _layout_for(rk)
        edges = layout["col_edges"]
        n_cols = len(edges) - 1
        row: list[str] = [""] * n_cols
        for w in y_buckets[rk]:
            xm = (w["x0"] + w["x1"]) / 2
            ci = _col_index(xm, edges)
            if ci is not None:
                row[ci] = (row[ci] + " " + w["text"]).strip()
        result.append((rk, row, layout))
    return result


def _merge_continuations(
    rows: list[tuple[float, list[str], _Layout]],
) -> list[tuple[list[str], _Layout]]:
    """Merge continuation rows (empty trans_time) into their nearest anchor."""
    anchors: list[tuple[int, float, _Layout]] = [
        (i, y, layout) for i, (y, row, layout) in enumerate(rows) if row[layout["trans_time"]] != ""
    ]
    if not anchors:
        return []

    result: dict[int, tuple[list[str], _Layout]] = {
        ai: (list(rows[ai][1]), rows[ai][2]) for ai, _, _ in anchors
    }
    {ai: ay for ai, ay, _ in anchors}

    for _, (y, row, layout) in enumerate(rows):
        tt_idx = layout["trans_time"]
        if row[tt_idx] != "" or not any(row):
            continue
        nearest = min(anchors, key=lambda a: abs(a[1] - y))
        ai, anchor_y, anchor_layout = nearest
        if abs(anchor_y - y) > _MAX_MERGE:
            continue

        a_row, a_layout = result[ai]
        desc_idx = a_layout["description"]
        ref_idx = a_layout["transaction_ref"]

        desc = row[layout["description"]].strip()
        if desc:
            cur = a_row[desc_idx]
            a_row[desc_idx] = (
                (desc + " " + cur).strip() if y < anchor_y else (cur + " " + desc).strip()
            )

        ref = row[layout["transaction_ref"]].strip()
        if ref:
            cur = a_row[ref_idx]
            a_row[ref_idx] = (ref + cur) if y < anchor_y else (cur + ref)

    return [result[ai] for ai, _, _ in sorted(anchors, key=lambda a: a[1])]


def _naira_to_kobo(s: str) -> int | None:
    """Convert a naira amount string like '4,200.00' to kobo integer.

    Returns ``None`` for '--', empty, or unparseable values.
    No rounding: '4,200.00' → 420000 exactly.
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


def _parse_row(
    row: list[str],
    layout: _Layout,
    account_last4: str | None,
) -> ParsedTransaction | None:
    """Convert a merged row into a ``ParsedTransaction``, or ``None`` on failure."""
    ts = row[layout["trans_time"]].strip()
    if not ts:
        return None
    try:
        txn_date = datetime.strptime(ts, "%d %b %Y %H:%M:%S").replace(tzinfo=_WAT)
    except ValueError:
        return None

    debit_k = _naira_to_kobo(row[layout["debit"]])
    credit_k = _naira_to_kobo(row[layout["credit"]])
    balance_k = _naira_to_kobo(row[layout["balance_after"]])

    if debit_k is not None:
        txn_type, amount = "debit", debit_k
    elif credit_k is not None:
        txn_type, amount = "credit", credit_k
    else:
        return None

    narration = row[layout["description"]].strip() or None
    ref = row[layout["transaction_ref"]].strip() or None

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


# ── parser ───────────────────────────────────────────────────────────────────


class _OPayStatementParser(StatementBankParser):
    def identify(
        self, content: bytes, email_body: str, password: str = ""
    ) -> tuple[str, str] | None:
        """Return ``(account_number, 'opay')`` if this file is an OPay statement.

        Detection strategy (both must pass):

        1. **Bank identity** — either the forwarding email body contains at
           least one OPay-specific signal, OR the PDF page-1 header text
           contains at least two of the PDF identity keywords.
        2. **Account number** — extracted from the PDF page-1 summary block.
           Returns ``None`` if the account number cannot be read.
        """
        # 1a. Check email body for OPay signals.
        email_match = any(sig in email_body for sig in _EMAIL_IDENTITY_SIGNALS)

        # 1b. If no email signal, check PDF page-1 text.
        if not email_match:
            try:
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    header_text = pdf.pages[0].crop((0, 99, 612, 330)).extract_text() or ""
                pdf_hits = sum(1 for kw in _PDF_IDENTITY_KEYWORDS if kw in header_text)
            except Exception:
                pdf_hits = 0
            if pdf_hits < 2:
                return None

        # 2. Extract account number from the PDF.
        account_number = _extract_account_number_from_pdf(content)
        if account_number is None:
            return None

        return (account_number, "opay")

    def parse(self, content: bytes, filename: str, password: str = "") -> list[ParsedTransaction]:
        """Parse an OPay wallet account statement PDF.

        Strategy
        --------
        1. Collect all Layout A (Wallet) rows and all Layout B (OWealth) rows.
        2. Strip internal OPay transfers from Layout A (OWealth Withdrawal
           credits, Auto-save debits, Spend & Save Deposit debits) — these
           are wallet ↔ OWealth shuffles, not real money flows.
           **Also clear balance_kobo on all wallet rows.**  The wallet settles
           to ₦0 every night, so its running balance would anchor the account
           balance to ₦0.  We want the anchor to be the OWealth closing
           balance instead (carried by the most recent Interest Earned entry).
        3. From Layout B keep only rows whose ``transaction_ref`` has NOT
           been seen in Layout A (i.e. entries unique to OWealth), and strip
           internal OWealth sub-account churn (Spend & Save pairs, etc.).
           This leaves only OWealth Interest Earned entries, which are
           genuine income not visible in the wallet section.  Their
           balance_after column holds the OWealth running balance; the
           most recent one becomes the authoritative account balance anchor.
        4. Merge and sort oldest-first.
        """
        # Always extract account number from the PDF itself — the filename
        # can be modified in transit and must not be trusted.
        account_number = _extract_account_number_from_pdf(content)
        account_last4 = account_number[-4:] if account_number else None
        layout_a: list[ParsedTransaction] = []
        layout_b: list[ParsedTransaction] = []

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages):
                crop = _CROP_P1 if i == 0 else _CROP_REST
                words = page.crop(crop).extract_words()
                if not words:
                    continue

                rows = _extract_page(words)
                merged = _merge_continuations(rows)

                for row_data, layout in merged:
                    txn = _parse_row(row_data, layout, account_last4)
                    if txn is None:
                        continue
                    if layout is _LAYOUT_B:
                        layout_b.append(txn)
                    else:
                        layout_a.append(txn)

        # Step 2: strip internal wallet transfers from Layout A.
        layout_a = [t for t in layout_a if not _OPAY_INTERNAL_RE.match(t.narration or "")]

        # Step 3: add Layout B rows that are unique to OWealth and are not
        # internal OWealth sub-account churn.
        seen_refs: set[str] = {t.transaction_ref for t in layout_a if t.transaction_ref}
        combined = list(layout_a)
        for txn in layout_b:
            if _OPAY_INTERNAL_RE.match(txn.narration or ""):
                continue
            if txn.transaction_ref is None or txn.transaction_ref not in seen_refs:
                combined.append(txn)

        # Sort oldest-first by transaction_date (None dates go last)
        combined.sort(key=lambda t: t.transaction_date or datetime.max.replace(tzinfo=_WAT))

        # Step 4: inject the OWealth closing balance as a sentinel transaction
        # dated one second after the last real transaction.  This becomes the
        # starting_balance anchor in process_bank_statement, ensuring that
        # computed_balance == OWealth closing balance (the true net worth) and
        # not the wallet's nightly-zero balance.
        # The sentinel carries amount_kobo=0 so it has no ledger impact.
        closing_kobo = _extract_owealth_closing_kobo(content)
        if closing_kobo is not None:
            last_date = next(
                (t.transaction_date for t in reversed(combined) if t.transaction_date),
                datetime.now(_WAT),
            )
            combined.append(
                ParsedTransaction(
                    transaction_type="credit",
                    amount_kobo=0,
                    account_last4=account_last4,
                    balance_kobo=closing_kobo,
                    narration="OWealth closing balance",
                    sender_email=None,
                    transaction_ref=f"opay-owealth-closing-{account_last4 or 'xxxx'}",
                    transaction_date=last_date + timedelta(seconds=1),
                )
            )

        return combined


register_statement_parser(
    BankInfo(slug="opay", display_name="OPay"),
    _OPayStatementParser(),
)
