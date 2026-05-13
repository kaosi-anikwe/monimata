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

Entry point: ``parse_receipt(text, bank_slug)``

OCR (Tesseract / Google Vision API) is performed **upstream** by the caller
before this function is invoked.  The dispatcher only deals with plain text.

The bank is identified by the slug the user selected when sharing the
receipt.  If the user has only one account, it can be inferred automatically.

Raises
------
``UnsupportedChannelError``
    The bank is registered but has no receipt parser yet.
``UnsupportedBankError``
    The slug is not registered at all.
"""

from __future__ import annotations

from app.services.ingestion.base import ParsedTransaction
from app.services.ingestion.channels.email import UnsupportedBankError
from app.services.ingestion.channels.statement import UnsupportedChannelError
from app.services.ingestion.registry import _BANKS, _RECEIPT_PARSERS


def parse_receipt(text: str, bank_slug: str) -> ParsedTransaction | None:
    """Parse OCR-extracted text from a transaction receipt.

    Parameters
    ----------
    text:
        Plain text produced by the OCR step.
    bank_slug:
        Slug of the bank the user selected, e.g. ``"opay"``.

    Returns a ``ParsedTransaction`` on success, or ``None`` if the text does
    not match any known receipt template for this bank.
    """
    if bank_slug not in _BANKS:
        raise UnsupportedBankError(f"No bank registered with slug: {bank_slug!r}")

    parser = _RECEIPT_PARSERS.get(bank_slug)
    if parser is None:
        raise UnsupportedChannelError(
            f"{_BANKS[bank_slug].display_name!r} does not yet support receipt ingestion"
        )

    return parser.parse(text)
