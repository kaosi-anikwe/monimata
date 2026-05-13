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
Email channel dispatcher.

``parse_email_alert(body, sender)`` is the single entry point for the email
ingestion channel.  It looks up the bank by sender domain in the registry and
delegates to that bank's dedicated parser.  There is no generic fallback: if
the sender domain is not registered, ``UnsupportedBankError`` is raised.

``probe_email_content(body)`` is used when the outer From address does not
identify a known bank — the common case for auto-forwarded emails where the
forwarding service rewrites the envelope sender.  It tries every registered
parser and returns a result only when exactly one parser matches, ensuring
we never silently attribute a transaction to the wrong bank.
"""

from __future__ import annotations

import logging

from app.services.ingestion.base import ParsedTransaction
from app.services.ingestion.registry import BankInfo, get_bank_by_email_domain, iter_email_parsers

logger = logging.getLogger(__name__)


class UnsupportedBankError(Exception):
    """Raised when no parser is registered for the email sender domain."""


def parse_email_alert(body: str, sender: str) -> ParsedTransaction:
    """Parse a bank alert email and return a ``ParsedTransaction``.

    *sender* is the From address of the email (as delivered to the webhook).
    It is used to route to the correct bank-specific parser via the sender
    domain registry.

    Raises
    ------
    ``UnsupportedBankError``
        The sender domain is not registered — this bank is not yet supported.
    ``ValueError``
        The parser recognised the bank but could not extract transaction data
        from the body (unknown template).  Caller should log a Sentry warning.
    """
    if not body:
        raise ValueError("Email body is empty")

    bank = get_bank_by_email_domain(sender)
    if bank is None:
        raise UnsupportedBankError(f"No parser registered for sender domain in: {sender!r}")

    from app.services.ingestion.registry import _EMAIL_PARSERS  # noqa: PLC0415

    parser = _EMAIL_PARSERS[bank.slug]
    result = parser.parse(body)
    if result is None:
        raise ValueError(f"Parser for {bank.display_name!r} could not extract data from email body")

    result.sender_email = sender
    return result


def probe_email_content(body: str) -> tuple[BankInfo, str] | None:
    """Try all registered email parsers against *body*.

    Collects every parser that successfully extracts a transaction.  Returns
    ``(BankInfo, representative_sender_domain)`` only when **exactly one**
    parser matches — a single match is treated as high-confidence.

    If multiple parsers match (ambiguous body), returns ``None`` and logs a
    warning so the overlapping patterns can be tightened.

    Used when the outer From address does not identify a known bank, which is
    the common case for auto-forwarded emails where the forwarding service
    rewrites the envelope sender.
    """
    matches: list[tuple[BankInfo, str]] = []
    for bank, parser in iter_email_parsers():
        try:
            if parser.parse(body) is not None:
                representative_domain = next(iter(bank.email_domains), bank.slug)
                matches.append((bank, representative_domain))
        except Exception:
            pass

    if len(matches) == 1:
        return matches[0]

    if len(matches) > 1:
        logger.warning(
            "probe_email_content: ambiguous — body matched %d parsers (%s); skipping",
            len(matches),
            ", ".join(b.slug for b, _ in matches),
        )
    return None
