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

"""UBA email alert parser.

Alert format (plain-text body):
    Acct:XXXXXXXXXX. Credit Alert of NGN1,234.56
    Acct:XXXXXXXXXX. Debit Alert of NGN1,234.56

Sender domain: ubagroup.com
"""

from __future__ import annotations

import re

from app.services.ingestion._utils import to_kobo
from app.services.ingestion.base import EmailBankParser, ParsedTransaction
from app.services.ingestion.registry import BankInfo, register_email_parser

_CREDIT_RE = re.compile(
    r"Acct:(?P<acct>\d+)\.\s*Credit Alert of NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
_DEBIT_RE = re.compile(
    r"Acct:(?P<acct>\d+)\.\s*Debit Alert of NGN\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)


class _UBAEmailParser(EmailBankParser):
    sender_domains: frozenset[str] = frozenset({"ubagroup.com"})

    def parse(self, body: str) -> ParsedTransaction | None:
        for pattern, txn_type in ((_CREDIT_RE, "credit"), (_DEBIT_RE, "debit")):
            m = pattern.search(body)
            if not m:
                continue
            g = m.groupdict()
            amount_kobo = to_kobo(g["amount"])
            if amount_kobo is None:
                continue
            acct = g.get("acct")
            return ParsedTransaction(
                transaction_type=txn_type,
                amount_kobo=amount_kobo,
                account_last4=acct[-4:] if acct else None,
                balance_kobo=None,  # UBA alerts do not include balance in this template
                narration=None,
                sender_email=None,
            )
        return None


register_email_parser(
    BankInfo(slug="uba", display_name="UBA"),
    _UBAEmailParser(),
)
