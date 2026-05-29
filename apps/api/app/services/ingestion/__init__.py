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
Bank data ingestion subsystem.

Importing this package populates the registry with all supported banks and
their channel parsers.  Simply doing::

    from app.services.ingestion import parse_email_alert, list_supported_banks

is sufficient — the import chain triggers registration automatically.

Public API
----------
``list_supported_banks()``
    Returns every registered bank sorted by display name.  Drive the
    "add account" bank picker on the frontend from this list.

``is_bank_supported(slug)``
    Fast membership check used by account-creation validation.

``parse_email_alert(body, sender)``
    Parse a bank alert email.  Raises ``UnsupportedBankError`` if the
    sender domain is not registered; raises ``ValueError`` if the parser
    cannot extract data from a recognised format.

``UnsupportedBankError``
    Exception raised when no parser is registered for an email sender.
"""

# Import the banks package — this single import triggers all bank modules,
# which call register_email_parser() as a module-level side-effect.
from app.services.ingestion import banks as _banks  # noqa: F401
from app.services.ingestion.base import (
    EmailBankParser,
    ParsedTransaction,
    ReceiptBankParser,
    StatementBankParser,
)
from app.services.ingestion.channels.email import (
    UnsupportedBankError,
    parse_email_alert,
    probe_email_content,
)
from app.services.ingestion.channels.receipt import (
    extract_text,
    identify_receipt,
    parse_receipt,
)
from app.services.ingestion.channels.statement import (
    UnsupportedChannelError,
    derive_statement_password,
    identify_statement,
    parse_statement,
    register_statement_password_fn,
)
from app.services.ingestion.registry import BankInfo, is_bank_supported, list_supported_banks

__all__ = [
    # Base types
    "ParsedTransaction",
    "EmailBankParser",
    "StatementBankParser",
    "ReceiptBankParser",
    # Registry
    "BankInfo",
    "is_bank_supported",
    "list_supported_banks",
    # Exceptions
    "UnsupportedBankError",
    "UnsupportedChannelError",
    # Email channel
    "parse_email_alert",
    "probe_email_content",
    # Statement channel
    "parse_statement",
    "identify_statement",
    "derive_statement_password",
    "register_statement_password_fn",
    # Receipt channel
    "identify_receipt",
    "parse_receipt",
    "extract_text",
]
