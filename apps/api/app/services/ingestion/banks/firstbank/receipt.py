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

"""First Bank of Nigeria transaction receipt parser — image / PDF OCR.

FirstBank receipts are generated from the mobile app or internet banking
portal and share a consistent labeled key-value layout:

    Transaction Receipt
    Successful
    ₦ AMOUNT
    AMOUNT IN WORDS
    DATE TIME

    From:               *****NNNNN        (masked sender account)
    Sender Name:        SENDER FULL NAME
    Beneficiary Name:   BENEFICIARY FULL NAME
    Account No:         NNNNNNNNNN        (beneficiary full account number)
    Bank:               BANK NAME
    Transaction Type:   Interbank Transfer
    Reference No:       NNNN…NNNN         (long numeric reference)
    Narration:          …

Direction is determined from the visible account numbers:

- Debit:  the "From:" value is a masked account (``*****NNNNN``); if the
  suffix matches the user's account number the user is the sender.
- Credit: the "Account No:" value is the beneficiary's full account number;
  if it matches the user's account number the user is the recipient.

``identify()`` extracts suffix candidates from BOTH the masked "From:" field
and the full "Account No:" field so the task can match either side against
the user's accounts without knowing the direction in advance.
"""

from __future__ import annotations

import io
import re
from datetime import UTC, datetime, timedelta, timezone

import pytesseract
from PIL import Image, ImageFilter

from app.services.ingestion.base import ParsedTransaction, ReceiptBankParser
from app.services.ingestion.channels.receipt import extract_text
from app.services.ingestion.registry import BankInfo, register_receipt_parser

# ── WAT (West Africa Time = UTC+1) ───────────────────────────────────────────
_WAT = timezone(timedelta(hours=1))

# ── Identity ─────────────────────────────────────────────────────────────────
# "firstbank" appears in the logo text; "transaction receipt" and "successful"
# are always the first two content lines on every FirstBank receipt.
_IDENTITY_TOKENS = ("transaction receipt", "successful", "firstbank")

# ── Regexes ───────────────────────────────────────────────────────────────────

# Amount — ₦ may be rendered by Tesseract as "N", "#", "₦", or missing
# entirely.  The amount always precedes "Two Hundred…" / "Only" word line
# or appears alone on a line near the top.
_AMOUNT_RE = re.compile(r"[₦N#]\s*([\d,]+\.\d{2})", re.IGNORECASE)
_AMOUNT_BARE_RE = re.compile(r"^([\d,]+\.\d{2})\s*$", re.MULTILINE)

# Date — "May 28, 2026 18:36:07" (no ordinal suffix, 24-hour clock)
_DATE_RE = re.compile(r"([A-Za-z]+\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}:\d{2})")

# "From: *****35395" — masked sender account.
# Captures the full value because Tesseract may render asterisks as noise
# characters (e.g. "*****35395" → "AEE S 5395").  The digit suffix is
# extracted separately by _from_account_suffix().
_FROM_RE = re.compile(r"^[ \t]*From[:\s]+(.+?)[ \t]*$", re.IGNORECASE | re.MULTILINE)

# "Account No: 1477199532" — beneficiary's full account number
_ACCOUNT_NO_RE = re.compile(r"^[ \t]*Account\s*No[:\s]+(\d{10,})", re.IGNORECASE | re.MULTILINE)

# "Reference No: 00001626052818360700208533056"
_REF_RE = re.compile(r"^[ \t]*Reference\s*No[:\s]+([\d\s]{10,})", re.IGNORECASE | re.MULTILINE)

# Named field helper — handles "Label: Value" on a single line
_FIELD_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _get_field(label: str, text: str) -> str | None:
    """Return the value for *label* from a ``Label: Value`` line, or ``None``."""
    if label not in _FIELD_RE_CACHE:
        _FIELD_RE_CACHE[label] = re.compile(
            rf"^[ \t]*{re.escape(label)}[:\s]+(.+?)[ \t]*$",
            re.IGNORECASE | re.MULTILINE,
        )
    m = _FIELD_RE_CACHE[label].search(text)
    return m.group(1).strip() or None if m else None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _naira_to_kobo(s: str) -> int | None:
    s = s.strip().replace(",", "")
    try:
        if "." in s:
            integer, decimal = s.split(".", 1)
            decimal = decimal.ljust(2, "0")[:2]
            return int(integer) * 100 + int(decimal)
        return int(s) * 100
    except (ValueError, AttributeError):
        return None


def _parse_date(s: str) -> datetime | None:
    """Parse "May 28, 2026 18:36:07" → UTC-aware datetime."""
    cleaned = s.strip()
    for fmt in ("%B %d, %Y %H:%M:%S", "%b %d, %Y %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=_WAT).astimezone(UTC)
        except ValueError:
            continue
    return None


def _from_account_suffix(from_raw: str) -> str | None:
    """Extract the trailing digit suffix from a 'From:' field value.

    Handles clean OCR (``'*****35395'`` → ``'35395'``) and degraded OCR
    where asterisks are replaced by noise (``'AEE S 5395'`` → ``'5395'``).
    Returns the last unbroken digit run of ≥ 4 digits, or None.
    """
    runs = [r for r in re.findall(r"\d+", from_raw) if len(r) >= 4]
    return runs[-1] if runs else None


def _extract_text_enhanced(content: bytes) -> str:
    """Re-OCR an image with 3× upscaling + sharpening.

    The default 2× greyscale OCR (used by ``extract_text``) sometimes
    renders the masked ``*****NNNNN`` "From:" digits as noise letters
    (e.g. ``tRABE SH SI5`` instead of ``***** 35395``).  A second pass
    at 3× with a sharpen filter reliably recovers the digit suffix.

    Only used as a fallback inside ``identify()`` when the default OCR
    fails to yield a usable From suffix; ``parse()`` continues to use the
    default OCR which preserves the full Reference No field.
    """
    if content[:4] == b"%PDF":
        return extract_text(content)

    img = Image.open(io.BytesIO(content)).convert("L")
    w, h = img.size
    img = img.resize((w * 3, h * 3), Image.Resampling.LANCZOS)
    img = img.filter(ImageFilter.SHARPEN)
    return pytesseract.image_to_string(img, config="--oem 3 --psm 6")


def _account_matches(account_number: str, field_value: str) -> bool:
    """Return True if *field_value* refers to *account_number*.

    Handles three cases:
    - Full account number: all extracted digits equal account_number.
    - Masked account, clean OCR: ``'*****NNNNN'`` — suffix after asterisks.
    - Masked account, degraded OCR: asterisks become noise; match via any
      digit run of ≥ 4 digits that is a suffix of account_number.
    """
    clean = re.sub(r"\s+", "", field_value)
    if re.sub(r"\D", "", clean) == account_number:
        return True
    for run in re.findall(r"\d+", clean):
        if len(run) >= 4 and account_number.endswith(run):
            return True
    return False


# ── Parser ────────────────────────────────────────────────────────────────────


class _FirstBankReceiptParser(ReceiptBankParser):
    def identify(self, image_bytes: bytes) -> list[str] | None:
        """Return candidate account-number suffixes if this looks like a FirstBank receipt.

        Extracts the digit suffix from the masked "From:" field (debit side)
        and the last 4 digits of the full "Account No:" field (credit side).
        Both are returned so the task can match either without knowing the
        transaction direction upfront.

        When the default 2× OCR fails to yield a usable digit suffix from the
        masked "From:" field (common with JPEG screenshots where asterisks
        get rendered as noise letters), a second pass with 3× upscaling and
        sharpening is attempted to recover the digits.
        """
        text = extract_text(image_bytes)
        lower = text.lower()
        if not all(tok in lower for tok in _IDENTITY_TOKENS):
            return None

        suffixes: list[str] = []

        # Masked sender account — last digit run ≥ 4 digits from the From value.
        from_m = _FROM_RE.search(text)
        from_suffix: str | None = None
        if from_m:
            from_suffix = _from_account_suffix(from_m.group(1).strip())

        # If the default OCR didn't yield a From suffix, try enhanced OCR.
        if from_suffix is None:
            enhanced = _extract_text_enhanced(image_bytes)
            from_m2 = _FROM_RE.search(enhanced)
            if from_m2:
                from_suffix = _from_account_suffix(from_m2.group(1).strip())

        if from_suffix:
            suffixes.append(from_suffix)

        # Full beneficiary account — last 4 digits
        acct_m = _ACCOUNT_NO_RE.search(text)
        if acct_m:
            digits = re.sub(r"\D", "", acct_m.group(1))
            if len(digits) >= 4:
                suffixes.append(digits[-4:])

        return suffixes if suffixes else None

    def parse(self, image_bytes: bytes, account_number: str) -> ParsedTransaction | None:
        """Parse a FirstBank receipt image or PDF and return the transaction.

        Field layout expected from Tesseract / pdfplumber output:

            Transaction Receipt
            Successful
            ₦ AMOUNT
            AMOUNT IN WORDS
            DATE

            From:               *****NNNNN
            Sender Name:        NAME
            Beneficiary Name:   NAME
            Account No:         NNNNNNNNNN
            Bank:               BANK NAME
            Transaction Type:   …
            Reference No:       NNNN…NNNN
            Narration:          …

        Returns ``None`` if the amount or direction cannot be determined.
        """
        text = extract_text(image_bytes)

        # ── Amount ────────────────────────────────────────────────────────────
        # Primary: currency-prefixed pattern handles ₦, N, #.
        amount_m = _AMOUNT_RE.search(text)
        if amount_m:
            amount_kobo = _naira_to_kobo(amount_m.group(1))
        else:
            # Fallback: find the first bare decimal line near the top.
            amount_m = _AMOUNT_BARE_RE.search(text)
            amount_kobo = _naira_to_kobo(amount_m.group(1)) if amount_m else None
        if amount_kobo is None:
            return None

        # ── Date ──────────────────────────────────────────────────────────────
        date_m = _DATE_RE.search(text)
        txn_date = _parse_date(date_m.group(1)) if date_m else None

        # ── Reference ─────────────────────────────────────────────────────────
        ref_m = _REF_RE.search(text)
        txn_ref = re.sub(r"\s+", "", ref_m.group(1)).strip() if ref_m else None

        # ── Direction ─────────────────────────────────────────────────────────
        # Debit:  user's account appears (masked) in "From:" field.
        # Credit: user's full account number appears in "Account No:" field.
        from_m = _FROM_RE.search(text)
        acct_m = _ACCOUNT_NO_RE.search(text)

        is_debit: bool | None = None
        if from_m and _account_matches(account_number, from_m.group(1).strip()):
            is_debit = True
        elif acct_m and _account_matches(account_number, acct_m.group(1).strip()):
            is_debit = False

        # Fallback: re-OCR with enhanced settings when the masked "From:"
        # digits were garbled by the default 2× pass.
        if is_debit is None:
            enhanced = _extract_text_enhanced(image_bytes)
            from_m2 = _FROM_RE.search(enhanced)
            acct_m2 = _ACCOUNT_NO_RE.search(enhanced)
            if from_m2 and _account_matches(account_number, from_m2.group(1).strip()):
                is_debit = True
            elif acct_m2 and _account_matches(account_number, acct_m2.group(1).strip()):
                is_debit = False

        if is_debit is None:
            return None

        txn_type = "debit" if is_debit else "credit"

        # ── Narration ─────────────────────────────────────────────────────────
        # Prefer the bank's own Narration field when present and meaningful.
        # The receipt prints the literal string "None" when no narration was
        # entered; treat that the same as absent.
        bank_narration = _get_field("Narration", text)
        if bank_narration and bank_narration.lower() == "none":
            bank_narration = None

        if bank_narration:
            narration: str = bank_narration
        elif is_debit:
            counterparty = _get_field("Beneficiary Name", text)
            bank_name = _get_field("Bank", text)
            if counterparty:
                narration = f"Transfer to {counterparty}"
            elif bank_name:
                narration = f"Transfer to {bank_name}"
            else:
                narration = "FirstBank Transfer"
        else:
            counterparty = _get_field("Sender Name", text)
            narration = f"Transfer from {counterparty}" if counterparty else "FirstBank Credit"

        return ParsedTransaction(
            transaction_type=txn_type,
            amount_kobo=amount_kobo,
            account_last4=account_number[-4:],
            balance_kobo=None,
            narration=narration,
            sender_email=None,
            transaction_ref=txn_ref,
            transaction_date=txn_date,
        )


register_receipt_parser(
    BankInfo(slug="firstbank", display_name="First Bank"),
    _FirstBankReceiptParser(),
)
