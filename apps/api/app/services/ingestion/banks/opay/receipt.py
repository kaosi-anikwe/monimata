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

"""OPay transaction receipt parser.

OPay receipts are sent as in-app screenshots or PDF exports of the
transaction detail screen.  OCR is performed upstream before this parser
is called.

When real OPay receipt samples are available, implement ``parse()`` here:
  - Match the OCR text against known OPay receipt templates.
  - Extract amount, balance, reference, date, and narration.
  - Return a ParsedTransaction.

The email parser (email.py) already handles the email-format receipt that
OPay sends post-transaction.  This parser is for images/PDFs of the
in-app transaction detail screen shared directly to MoniMata.

TODO: implement once OPay receipt OCR samples are collected.
"""

from __future__ import annotations

from app.services.ingestion.base import ParsedTransaction, ReceiptBankParser
from app.services.ingestion.registry import BankInfo, register_receipt_parser


class _OPayReceiptParser(ReceiptBankParser):
    def parse(self, text: str) -> ParsedTransaction | None:
        raise NotImplementedError(
            "OPay receipt parser is not yet implemented. "
            "Implement this method once OPay receipt OCR samples are collected."
        )


register_receipt_parser(
    BankInfo(slug="opay", display_name="OPay"),
    _OPayReceiptParser(),
)
