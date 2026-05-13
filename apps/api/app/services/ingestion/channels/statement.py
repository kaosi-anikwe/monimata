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
Statement channel dispatcher.

Entry point: ``parse_statement(content, filename, bank_slug)``

The bank is always identified by the slug the user selected in the UI at
upload time — there is no auto-detection from file contents.

Flow
----
1. Look up the registered ``StatementBankParser`` for *bank_slug*.
2. Delegate to ``parser.parse(content, filename)``.
3. Return the list of ``ParsedTransaction`` objects.

Raises
------
``UnsupportedChannelError``
    The bank is registered but has no statement parser yet.
``UnsupportedBankError``
    The slug is not registered at all.
``ValueError``
    The parser could not extract transactions from the file (corrupt / wrong
    format).  Caller should surface this error to the user.
"""

from __future__ import annotations

from app.services.ingestion.base import ParsedTransaction
from app.services.ingestion.channels.email import UnsupportedBankError
from app.services.ingestion.registry import _BANKS, _STATEMENT_PARSERS, iter_statement_parsers


class UnsupportedChannelError(Exception):
    """Raised when a bank is registered but has no parser for this channel."""


def parse_statement(content: bytes, filename: str, bank_slug: str) -> list[ParsedTransaction]:
    """Parse an uploaded or forwarded bank statement.

    Parameters
    ----------
    content:
        Raw file bytes (PDF or CSV).
    filename:
        Original filename, used by parsers to distinguish file types.
    bank_slug:
        Slug of the bank the user selected, e.g. ``"opay"``.

    Returns a list of ``ParsedTransaction`` objects ordered oldest-first.
    """
    if bank_slug not in _BANKS:
        raise UnsupportedBankError(f"No bank registered with slug: {bank_slug!r}")

    parser = _STATEMENT_PARSERS.get(bank_slug)
    if parser is None:
        raise UnsupportedChannelError(
            f"{_BANKS[bank_slug].display_name!r} does not yet support statement ingestion"
        )

    return parser.parse(content, filename)


def identify_statement(content: bytes, email_body: str = "") -> tuple[str, str] | None:
    """Probe a statement file to determine which bank issued it.

    Tries every registered ``StatementBankParser`` in turn.  Returns
    ``(account_number, bank_slug)`` from the first parser that recognises
    the file, or ``None`` if no parser claims it.

    Parameters
    ----------
    content:
        Raw file bytes (PDF or CSV).
    email_body:
        Plain-text body of the forwarding email, if available.  Parsers
        may use this as an additional signal (e.g. sender domain, keywords).
    """
    for _bank_info, parser in iter_statement_parsers():
        try:
            result = parser.identify(content, email_body)
        except Exception:
            continue
        if result is not None:
            return result
    return None
