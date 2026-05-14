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

"""OPay transaction receipt parser — image OCR (pytesseract).

OPay receipts are screenshots of the in-app transaction detail screen.
The layout is fixed and consistent:

    OPay logo         Transaction Receipt
    ₦AMOUNT
    Successful
    DATE TIME

    Recipient Details   NAME
                        OPay | PHONE (full or masked)

    Sender Details      NAME
                        OPay | PHONE (full or masked)

    Transaction No.     REF_NUMBER

OPay always masks the account holder's number (``XXX****YYY``) and shows
the counterparty's number in full.  ``identify()`` finds the masked number
and returns its suffix so the channel can resolve the account from the DB.
``parse()`` then uses the full account number to establish direction:
- match in Recipient Details → credit
- match in Sender Details    → debit
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from app.services.ingestion.base import ParsedTransaction, ReceiptBankParser
from app.services.ingestion.channels.receipt import extract_text
from app.services.ingestion.registry import BankInfo, register_receipt_parser

# ── WAT (West Africa Time = UTC+1) ──────────────────────────────────────────
_WAT = timezone(timedelta(hours=1))

# ── Identification signals ───────────────────────────────────────────────────
# OCR text must contain ALL of these (case-insensitive) to be an OPay receipt.
_IDENTITY_TOKENS = ("opay", "transaction receipt")

# Masked phone suffix: "901****964" → group 1 = "964"
_MASKED_SUFFIX_RE = re.compile(r"\*+(\d+)")

# ── Regex patterns ───────────────────────────────────────────────────────────

# Amount: ₦7,500.00 — tesseract may render ₦ as N, #, or H
_AMOUNT_RE = re.compile(r"[₦Nn#H]\s*([\d,]+\.\d{2})")

# Date: "May 13th, 2026 20:03:36"
_DATE_RE = re.compile(r"([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\s+\d{1,2}:\d{2}:\d{2})")

# OPay phone number after "OPay |" — full ("123 456 7890") or masked ("123****890")
# Tesseract sometimes reads | as l, I, or 1
_OPAY_PHONE_RE = re.compile(r"OPay\s*[|lI1]\s*([\d][\d\s\*]+)", re.IGNORECASE)

# Transaction reference — long digit string after "Transaction No."
_REF_RE = re.compile(r"Transaction\s+No\.?\s*[:\s]*([\d]{15,})", re.IGNORECASE)

# ALL-CAPS name (at least two words)
_NAME_RE = re.compile(r"([A-Z][A-Z\s]{4,})")


# ── Helpers ──────────────────────────────────────────────────────────────────


def _clean_phone(raw: str) -> str:
    """Strip spaces, keep digits and asterisks."""
    return re.sub(r"\s+", "", raw.strip())


def _phone_matches(phone: str, account_number: str) -> bool:
    """Return True if *phone* (full or masked) matches *account_number*.

    Full match:   cleaned phone digits == account_number
    Masked match: phone ends with XXX****YYY — compare YYY against
                  the last len(YYY) digits of account_number.
    """
    digits_only = re.sub(r"\D", "", phone)
    if digits_only == account_number:
        return True
    # Masked: extract the suffix after the asterisks
    m = re.search(r"\*+(\d+)$", phone)
    if m:
        suffix = m.group(1)
        return account_number.endswith(suffix)
    return False


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
    cleaned = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", s).replace(",", "").strip()
    for fmt in ("%B %d %Y %H:%M:%S", "%b %d %Y %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=_WAT)
        except ValueError:
            continue
    return None


def _extract_name_from_section(section_text: str) -> str | None:
    """Find the ALL-CAPS name inside a Recipient or Sender section."""
    # Remove the "OPay | PHONE" line to avoid matching "OPAY"
    cleaned = re.sub(r"OPay\s*[|lI1].*", "", section_text, flags=re.IGNORECASE)
    names = _NAME_RE.findall(cleaned)
    if names:
        return names[0].strip()
    return None


# ── Parser ───────────────────────────────────────────────────────────────────


class _OPayReceiptParser(ReceiptBankParser):
    def identify(self, image_bytes: bytes) -> list[str] | None:
        """Return candidate account-number suffixes if this looks like an OPay receipt.

        Extracts phone numbers from **both** Recipient and Sender sections:
        - Full phone (e.g. ``1234567890``) → last 4 digits (``"7890"``)
        - Masked phone (e.g. ``123****890``) → suffix after asterisks (``"890"``)

        Both the user's number and the counterparty's number appear on every
        OPay receipt; returning all candidates lets the task match the correct
        account regardless of whether the user is the sender or recipient:

        - Credit receipt: user's **full** number is in Recipient Details.
          Masked number in Sender Details belongs to the counterparty.
        - Debit receipt: user's **masked** number is in Sender Details.
          Full number in Recipient Details belongs to the counterparty.

        The task calls ``parse()`` on each candidate account to find the one
        where a phone actually matches, eliminating false positives.
        """
        text = extract_text(image_bytes)
        lower = text.lower()
        if not all(tok in lower for tok in _IDENTITY_TOKENS):
            return None

        suffixes: list[str] = []
        for raw in _OPAY_PHONE_RE.findall(text):
            phone = _clean_phone(raw)
            if "*" in phone:
                # Masked number — extract suffix after the asterisks
                m = _MASKED_SUFFIX_RE.search(phone)
                if m:
                    suffixes.append(m.group(1))
            else:
                # Full number — use last 4 digits
                digits = re.sub(r"\D", "", phone)
                if len(digits) >= 4:
                    suffixes.append(digits[-4:])

        return suffixes if suffixes else None

    def parse(self, image_bytes: bytes, account_number: str) -> ParsedTransaction | None:
        """Parse an OPay receipt image or PDF and return the transaction.

        Works for both image screenshots and PDF exports of the OPay
        transaction detail screen.  The two formats produce different text
        orderings when extracted:

        - **Image (OCR)**: section label precedes its data block
          (``Recipient Details`` → name → phone)
        - **PDF (pdfplumber)**: data block precedes its label
          (name → phone → ``Recipient Details``)

        Rather than relying on label positions, the parser uses the
        **appearance order of "OPay | PHONE" matches**: the first match is
        always the recipient's number and the second is the sender's,
        regardless of whether labels come before or after the data.

        Returns ``None`` if critical fields cannot be extracted.
        """
        text = extract_text(image_bytes)

        # ── Amount ────────────────────────────────────────────────────────────
        amount_match = _AMOUNT_RE.search(text)
        if not amount_match:
            return None
        amount_kobo = _naira_to_kobo(amount_match.group(1))
        if amount_kobo is None:
            return None

        # ── Date ──────────────────────────────────────────────────────────────
        date_match = _DATE_RE.search(text)
        txn_date = _parse_date(date_match.group(1)) if date_match else None

        # ── Transaction reference ─────────────────────────────────────────────
        ref_match = _REF_RE.search(text)
        txn_ref = ref_match.group(1) if ref_match else None

        # ── Phone matching (position-based, layout-agnostic) ──────────────────
        # Regardless of whether labels precede or follow data blocks, the
        # first "OPay | PHONE" match is the recipient's and the second is the
        # sender's.  This ordering is consistent for both image OCR and PDF
        # text extraction.
        phone_matches = list(_OPAY_PHONE_RE.finditer(text))
        if len(phone_matches) < 2:
            return None

        recipient_phone = _clean_phone(phone_matches[0].group(1))
        sender_phone = _clean_phone(phone_matches[1].group(1))

        # ── Credit / debit determination ──────────────────────────────────────
        is_credit: bool | None = None
        if _phone_matches(recipient_phone, account_number):
            is_credit = True
        elif _phone_matches(sender_phone, account_number):
            is_credit = False

        if is_credit is None:
            return None

        # ── Counterparty name ─────────────────────────────────────────────────
        # Look for the ALL-CAPS name adjacent to the counterparty's phone
        # match.  Slicing 150 chars on either side covers both orderings:
        #   PDF:  …NAME\nOPay | PHONE\nLabel…  (name before phone)
        #   OCR:  …Label NAME\nOPay | PHONE…   (name before phone, after label)
        cp_match = phone_matches[1] if is_credit else phone_matches[0]
        cp_start = max(0, cp_match.start() - 150)
        cp_end = min(len(text), cp_match.end() + 150)
        counterparty_name = _extract_name_from_section(text[cp_start:cp_end])

        txn_type = "credit" if is_credit else "debit"
        narration = (
            (
                f"Transfer from {counterparty_name}"
                if is_credit
                else f"Transfer to {counterparty_name}"
            )
            if counterparty_name
            else f"OPay {txn_type.capitalize()}"
        )

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
    BankInfo(slug="opay", display_name="OPay"),
    _OPayReceiptParser(),
)
