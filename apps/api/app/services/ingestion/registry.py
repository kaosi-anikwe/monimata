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
Central registry for supported banks and their per-channel parsers.

Banks self-register at import time by calling ``register_email_parser()``
(or the equivalent for future channels).  The ``banks`` package imports
every bank module, so importing ``app.services.ingestion`` is sufficient
to populate the registry.

Public surface
--------------
``list_supported_banks()`` — returns every registered bank, sorted by
    display name.  Used to drive the "add account" picker on the frontend.

``is_bank_supported(slug)`` — fast membership test used by account-creation
    validation.

``get_bank_by_email_domain(sender)`` — given a raw From address, returns the
    ``BankInfo`` whose registered sender domain is present in the address.
    Returns ``None`` if no bank owns that domain.

``iter_email_parsers()`` — yields ``(BankInfo, EmailBankParser)`` for every
    registered email parser.  Used by the CAF content-probe fallback in the
    webhook router.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.ingestion.base import EmailBankParser


@dataclass(frozen=True)
class BankInfo:
    """Metadata about a supported bank."""

    slug: str
    """Machine-readable identifier, e.g. ``"gtbank"``.  Stored in the
    ``bank_accounts.institution`` column (lower-case slug form)."""

    display_name: str
    """Human-readable name shown in the UI, e.g. ``"GTBank"``."""

    channels: frozenset[str] = field(default_factory=frozenset)
    """Ingestion channels this bank currently supports: ``"email"``,
    ``"statement"``, ``"receipt"``."""

    email_domains: frozenset[str] = field(default_factory=frozenset)
    """Sender email domains that identify this bank's alert emails.
    Populated automatically by ``register_email_parser()``."""


# ── Internal registry state ─────────────────────────────────────────────────

# slug → BankInfo (authoritative)
_BANKS: dict[str, BankInfo] = {}

# sender_domain (lower-case) → bank slug  (for fast O(1) lookup)
_EMAIL_DOMAIN_MAP: dict[str, str] = {}

# bank slug → EmailBankParser instance
_EMAIL_PARSERS: dict[str, EmailBankParser] = {}


# ── Registration ─────────────────────────────────────────────────────────────


def register_email_parser(bank: BankInfo, parser: EmailBankParser) -> None:
    """Register *bank* and its email *parser*.

    Called once per bank module at import time (module-level side-effect).
    Re-registering the same slug overwrites the previous entry — useful in
    tests that want to swap parsers.
    """
    merged = dataclasses.replace(
        bank,
        channels=bank.channels | frozenset({"email"}),
        email_domains=parser.sender_domains,
    )
    _BANKS[bank.slug] = merged
    _EMAIL_PARSERS[bank.slug] = parser
    for domain in parser.sender_domains:
        _EMAIL_DOMAIN_MAP[domain.lower()] = bank.slug


# ── Public query API ─────────────────────────────────────────────────────────


def list_supported_banks() -> list[BankInfo]:
    """Return all registered banks sorted by display name.

    This is the canonical source for the "add account" bank picker on the
    frontend.  A bank that has no registered parsers will not appear here.
    """
    return sorted(_BANKS.values(), key=lambda b: b.display_name)


def is_bank_supported(slug: str) -> bool:
    """Return ``True`` if *slug* is a registered bank."""
    return slug in _BANKS


def get_bank_by_email_domain(sender: str) -> BankInfo | None:
    """Return the ``BankInfo`` whose sender domain appears in *sender*.

    *sender* is the raw From address of an incoming email, e.g.
    ``"alerts@gtbank.com"`` or ``"GTBank Alerts <alerts@gtbank.com>"``.

    Returns ``None`` if no registered bank owns a domain present in *sender*.
    """
    sender_lower = sender.lower().strip()
    for domain, slug in _EMAIL_DOMAIN_MAP.items():
        if domain in sender_lower:
            return _BANKS[slug]
    return None


def iter_email_parsers() -> Iterator[tuple[BankInfo, EmailBankParser]]:
    """Yield ``(BankInfo, parser)`` for every registered email parser.

    Used by the CAF content-probe strategy in ``channels.email``.
    """
    for slug, parser in _EMAIL_PARSERS.items():
        yield _BANKS[slug], parser
