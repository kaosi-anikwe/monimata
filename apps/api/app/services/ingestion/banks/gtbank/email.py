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

"""GTBank email alert parser.

Alert format (plain-text body):
    Acct:0123456789; Cr:N1,234.56; Desc:POS/ATM; Bal:N5,000.00
    Acct:0123456789; Dr:N1,234.56; Desc:POS/ATM; Bal:N5,000.00

Sender domain: gtbank.com
"""

from __future__ import annotations

import re

from app.services.ingestion._utils import to_kobo
from app.services.ingestion.base import EmailBankParser, ParsedTransaction
from app.services.ingestion.registry import BankInfo, register_email_parser

_CREDIT_RE = re.compile(
    r"Acct:(?P<acct>\d+);\s*Cr:N(?P<amount>[\d,]+(?:\.\d{1,2})?);"
    r"(?:.*?Desc:(?P<narration>[^;]+))?.*?Bal:N(?P<balance>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE | re.DOTALL,
)
_DEBIT_RE = re.compile(
    r"Acct:(?P<acct>\d+);\s*Dr:N(?P<amount>[\d,]+(?:\.\d{1,2})?);"
    r"(?:.*?Desc:(?P<narration>[^;]+))?.*?Bal:N(?P<balance>[\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE | re.DOTALL,
)


class _GTBankEmailParser(EmailBankParser):
    sender_domains: frozenset[str] = frozenset({"gtbank.com"})

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
            narration = (g.get("narration") or "").strip() or None
            return ParsedTransaction(
                transaction_type=txn_type,
                amount_kobo=amount_kobo,
                account_last4=acct[-4:] if acct else None,
                balance_kobo=to_kobo(g.get("balance")),
                narration=narration,
                sender_email=None,  # set by channel dispatcher
            )
        return None


register_email_parser(
    BankInfo(
        slug="gtbank",
        display_name="GTBank",
        email_subject_keywords=frozenset({"Transaction Alert", "Credit Alert", "Debit Alert"}),
    ),
    _GTBankEmailParser(),
)
