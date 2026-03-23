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

from datetime import datetime

from pydantic import BaseModel


class ConnectAccountRequest(BaseModel):
    code: str  # one-time auth_code from Mono Connect SDK


class BankAccountResponse(BaseModel):
    id: str
    institution: str
    account_name: str
    account_type: str
    currency: str
    balance: int  # kobo
    last_synced_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}


class SyncStatusResponse(BaseModel):
    syncing: bool
    last_synced_at: datetime | None
