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
Receipt channel dispatcher.

Entry points
------------
``identify_receipt(image_bytes)``
    Try every registered parser's ``identify()`` method in turn; return
    ``(bank_slug, account_suffix)`` from the first parser that recognises
    the image, or ``None`` if no parser matches.  Mirrors the statement
    channel's ``identify_statement()`` pattern.  No bank slug or account ID
    needs to be known in advance — the parser extracts everything from the
    image.

``parse_receipt(image_bytes, bank_slug, account_number)``
    Delegate to the named bank's parser.  The caller is responsible for
    resolving the account first via ``identify_receipt`` + a DB lookup.

``extract_text(content)``
    Shared Tesseract wrapper.  Bank parsers import this directly so OCR
    configuration is defined once but each parser calls it with its own
    image bytes.

Raises
------
``UnsupportedChannelError``
    The bank is registered but has no receipt parser.
``UnsupportedBankError``
    The bank slug is not in the registry at all.
"""

from __future__ import annotations

import io

import pytesseract
from PIL import Image

from app.services.ingestion.base import ParsedTransaction
from app.services.ingestion.channels.email import UnsupportedBankError
from app.services.ingestion.channels.statement import UnsupportedChannelError
from app.services.ingestion.registry import _BANKS, _RECEIPT_PARSERS, iter_receipt_parsers

# ── Shared text extraction utility ────────────────────────────────────────────


def extract_text(content: bytes) -> str:
    """Extract plain text from a receipt image or PDF.

    Receipts arrive as either image screenshots (JPEG / PNG / WebP) or PDF
    exports of the same in-app screen.  This function handles both:

    - **PDF** (detected by the ``%PDF`` magic bytes): text is extracted
      directly via pdfplumber.  No OCR needed because OPay receipt PDFs
      embed selectable text.
    - **Image**: converted to greyscale and upscaled 2× before being
      passed to Tesseract for OCR.

    Bank parsers import and call this rather than invoking pytesseract or
    pdfplumber directly, so format detection is centralised here.
    """
    if content[:4] == b"%PDF":
        import pdfplumber

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)

    img = Image.open(io.BytesIO(content)).convert("L")
    w, h = img.size
    img = img.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
    return pytesseract.image_to_string(img, config="--oem 3 --psm 6")


# ── Auto-identification ───────────────────────────────────────────────────────


def identify_receipt(image_bytes: bytes) -> tuple[str, list[str]] | None:
    """Try every registered parser; return ``(bank_slug, candidate_suffixes)`` or ``None``.

    Each parser's ``identify()`` OCRs the image and returns the account-number
    suffixes it can extract from ALL phone numbers on the receipt — both full
    numbers (last 4 digits) and masked numbers (digits after the asterisks).
    This covers both the credit case (user's full number is visible) and the
    debit case (user's number is masked).

    The task matches each suffix against the user's decrypted account numbers
    and uses ``parse()`` as the final disambiguator to confirm the correct
    account and direction.
    """
    for info, parser in iter_receipt_parsers():
        suffixes = parser.identify(image_bytes)
        if suffixes is not None:
            return info.slug, suffixes
    return None


# ── Parser dispatch ───────────────────────────────────────────────────────────


def parse_receipt(
    image_bytes: bytes,
    bank_slug: str,
    account_number: str,
) -> ParsedTransaction | None:
    """Parse a receipt image using the bank-specific parser.

    Parameters
    ----------
    image_bytes:
        Raw image bytes (JPEG / PNG / WebP).  The parser performs OCR
        internally.
    bank_slug:
        Slug of the bank whose parser to invoke.
    account_number:
        The user's full decrypted account number, used by the parser to
        determine credit vs. debit direction.

    Returns a ``ParsedTransaction`` on success, or ``None`` if parsing fails.
    Raises ``UnsupportedBankError`` / ``UnsupportedChannelError`` as
    appropriate.
    """
    if bank_slug not in _BANKS:
        raise UnsupportedBankError(f"No bank registered with slug: {bank_slug!r}")

    parser = _RECEIPT_PARSERS.get(bank_slug)
    if parser is None:
        raise UnsupportedChannelError(
            f"{_BANKS[bank_slug].display_name!r} does not yet support receipt ingestion"
        )

    return parser.parse(image_bytes, account_number)
