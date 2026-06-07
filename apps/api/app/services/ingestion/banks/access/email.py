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

"""Access Bank email alert parser.

Alert format (plain-text body):
    Your Acct *XXXX has been credited with NGN 1,234.56 on ...
    Your Acct *XXXX has been debited with NGN 1,234.56 on ...

Sender domain: accessbankplc.com
"""

from __future__ import annotations

import re

from app.services.ingestion._utils import to_kobo
from app.services.ingestion.base import EmailBankParser, ParsedTransaction
from app.services.ingestion.registry import BankInfo, register_email_parser

_CREDIT_RE = re.compile(
    r"Acct\s+\*+(?P<acct>\d{4})\s+has been credited with\s+NGN"
    r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
_DEBIT_RE = re.compile(
    r"Acct\s+\*+(?P<acct>\d{4})\s+has been debited with\s+NGN"
    r"\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)


class _AccessBankEmailParser(EmailBankParser):
    sender_domains: frozenset[str] = frozenset({"accessbankplc.com"})

    def parse(self, body: str) -> ParsedTransaction | None:
        for pattern, txn_type in ((_CREDIT_RE, "credit"), (_DEBIT_RE, "debit")):
            m = pattern.search(body)
            if not m:
                continue
            g = m.groupdict()
            amount_kobo = to_kobo(g["amount"])
            if amount_kobo is None:
                continue
            return ParsedTransaction(
                transaction_type=txn_type,
                amount_kobo=amount_kobo,
                account_last4=g.get("acct"),
                balance_kobo=None,  # Access Bank alerts do not include balance
                narration=None,
                sender_email=None,
            )
        return None


register_email_parser(
    BankInfo(
        slug="access",
        display_name="Access Bank",
        email_subject_keywords=frozenset({"Transaction Alert", "Credit Alert", "Debit Alert"}),
    ),
    _AccessBankEmailParser(),
)
