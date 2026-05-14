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
# Actual Tesseract output from OPay receipt images:
#   - OPay logo → "<) Pay" (circular logo misread), but "OPay" appears in
#     every phone line as "OPay | PHONE"
#   - Header is literally "Transaction Receipt"
#   - "Successful" always appears on its own line below the amount
#   - "Recipient Details" and "Sender Details" always present
# All three tokens below are always present in the actual OCR output.
_IDENTITY_TOKENS = ("opay", "transaction receipt", "successful")

# Masked phone suffix: "901****964" → group 1 = "964"
_MASKED_SUFFIX_RE = re.compile(r"\*+(\d+)")

# ── Regex patterns ───────────────────────────────────────────────────────────

# Amount: Tesseract never outputs the ₦ glyph from images — the number appears
# as bare digits directly above the word "Successful".
# Primary pattern anchored to "Successful" (image path).
# Fallback pattern with currency prefix for pdfplumber text (PDF path).
_AMOUNT_RE = re.compile(r"([\d,]+\.\d{2})\s*\nSuccessful", re.IGNORECASE)
_AMOUNT_PDF_RE = re.compile(r"[₦N#]\s*([\d,]+\.\d{2})")

# Date: "May 13th, 2026 20:03:36"  — ordinal suffix is always present in OPay receipts
_DATE_RE = re.compile(r"([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th),\s*\d{4}\s+\d{1,2}:\d{2}:\d{2})")

# OPay phone lines: exact OCR output is "OPay | 901 645 6964" or "OPay | 901****868"
# The pipe is always a real | in practice; [|lI1] guards against rare misreads.
# Single group: \d[\d *]+\d covers full numbers (spaces) and masked (asterisks).
_OPAY_PHONE_RE = re.compile(r"OPay\s*[|lI1]\s*(\d[\d *]+\d)", re.IGNORECASE)

# Transaction reference — "Transaction No. 260513010100240293620823"
# (no colon in actual OCR output; just one or more spaces)
_REF_RE = re.compile(r"Transaction\s+No\.\s+([\d]{15,})", re.IGNORECASE)

# Section header anchors — always "Recipient Details" and "Sender Details"
# These appear on the same line as the counterparty name in OCR output, e.g.:
#   "Recipient Details KAOSISOCHUKWU HENRY ANIKWE"
_RECIPIENT_SECTION_RE = re.compile(r"Recipient\s+Details", re.IGNORECASE)
_SENDER_SECTION_RE = re.compile(r"Sender\s+Details", re.IGNORECASE)

# Phone after any "BANK | PHONE" pattern — captures both OPay and other banks
# (e.g. "MONIE POINT | 5044478717").  The pipe is always literal | in the OCR
# samples but [|lI1] is kept for robustness.
# Single group: \d[\d *]+\d covers full numbers (spaces) and masked (asterisks).
_PIPE_PHONE_RE = re.compile(r"[|lI1]\s*(\d[\d *]+\d)")

# Stop capturing the sender section at the transaction reference lines
_SECTION_END_RE = re.compile(r"Transaction\s+No\.|Session\s+ID", re.IGNORECASE)

# ALL-CAPS name sequence (person or business name)
_NAME_RE = re.compile(r"([A-Z][A-Z ]{4,})")


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
    """Find the ALL-CAPS person/business name inside a Recipient or Sender section.

    Strips phone-carrier lines ("OPay | ...", "MONIE POINT | ...") before
    scanning so that bank names are not returned instead of the account holder.
    Uses a literal pipe to avoid the [lI1] aliases accidentally matching
    uppercase letters inside the name itself (e.g. the 'I' in "CHEESYBITE").
    """
    cleaned = re.sub(r"[^\n]*\|[^\n]*\n", "", section_text)
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

        Tuned to the exact Tesseract output observed from OPay receipt images:

          '<) Pay Transaction Receipt\n{AMOUNT}\nSuccessful\n{DATE}\n'
          'Recipient Details {NAME}\n\nOPay | {PHONE}\n'
          'Sender Details {NAME}\nOPay | {PHONE}\n'
          'Transaction No. {REF}\n'

        Notable OCR behaviours:
          - The ₦ glyph is **never** emitted; amount is bare digits.
          - The OPay logo renders as "<) Pay"; "OPay" only appears in phone lines.
          - Section headers share their line with the counterparty name.
          - Pipe character is always a literal ``|``.
          - Counterparty may be on a different bank (e.g. Monie Point).

        Primary strategy: locate section headers, extract phones from each
        section using any ``BANK | PHONE`` pattern.
        Fallback: position-based ``OPay | PHONE`` ordering for cases where
        section headers are not found in the OCR output.

        Returns ``None`` if amount or credit/debit direction cannot be determined.
        """
        text = extract_text(image_bytes)

        # ── Amount ────────────────────────────────────────────────────────────
        # Image path: bare number directly above "Successful" (no ₦ from OCR)
        # PDF path: pdfplumber preserves the ₦ prefix
        amount_match = _AMOUNT_RE.search(text) or _AMOUNT_PDF_RE.search(text)
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

        # ── Credit / debit determination ──────────────────────────────────────
        is_credit: bool | None = None
        counterparty_name: str | None = None

        # Strategy 1: section-header anchoring (handles cross-bank receipts)
        recipient_m = _RECIPIENT_SECTION_RE.search(text)
        sender_m = _SENDER_SECTION_RE.search(text)

        if recipient_m and sender_m:
            recipient_section = text[recipient_m.end() : sender_m.start()]

            # Stop the sender region before "Transaction No." / "Session ID"
            sentinel = _SECTION_END_RE.search(text, sender_m.end())
            sender_end = sentinel.start() if sentinel else sender_m.end() + 300
            sender_section = text[sender_m.end() : sender_end]

            r_phones = [
                _clean_phone(m.group(1)) for m in _PIPE_PHONE_RE.finditer(recipient_section)
            ]
            s_phones = [_clean_phone(m.group(1)) for m in _PIPE_PHONE_RE.finditer(sender_section)]

            if any(_phone_matches(p, account_number) for p in r_phones):
                is_credit = True
                counterparty_name = _extract_name_from_section(sender_section)
            elif any(_phone_matches(p, account_number) for p in s_phones):
                is_credit = False
                counterparty_name = _extract_name_from_section(recipient_section)

        # Strategy 2: position-based OPay phone ordering (fallback)
        if is_credit is None:
            all_opay = list(_OPAY_PHONE_RE.finditer(text))
            if len(all_opay) >= 2:
                recipient_phone = _clean_phone(all_opay[0].group(1))
                sender_phone = _clean_phone(all_opay[1].group(1))
                cp_match = None
                if _phone_matches(recipient_phone, account_number):
                    is_credit = True
                    cp_match = all_opay[1]
                elif _phone_matches(sender_phone, account_number):
                    is_credit = False
                    cp_match = all_opay[0]
                if is_credit is not None and cp_match is not None:
                    w_start = max(0, cp_match.start() - 150)
                    w_end = min(len(text), cp_match.end() + 150)
                    counterparty_name = _extract_name_from_section(text[w_start:w_end])

        if is_credit is None:
            return None

        # ── Counterparty name → narration ─────────────────────────────────────
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
