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

from pydantic import BaseModel, Field


class ConnectAccountRequest(BaseModel):
    code: str  # one-time auth_code from Mono Connect SDK


class AddManualAccountRequest(BaseModel):
    institution: str
    bank_code: str  # CBN institution code, e.g. "058"
    account_number: str = Field(min_length=10, max_length=10, pattern=r"^\d{10}$")
    alias: str  # user-defined display name
    account_type: str = "SAVINGS"  # "SAVINGS" | "CURRENT"
    currency: str = "NGN"
    # Optional opening balance in kobo; defaults to 0
    balance: int = 0


class UpdateManualBalanceRequest(BaseModel):
    balance: int = Field(ge=0, description="New balance in kobo")
    note: str | None = None


class UpdateAliasRequest(BaseModel):
    alias: str


class BankAccountResponse(BaseModel):
    id: str
    institution: str
    account_name: str
    alias: str | None = None
    account_number: str | None = None
    bank_code: str | None = None
    account_type: str
    currency: str
    balance: int  # kobo
    balance_as_of: datetime | None = None
    last_synced_at: datetime | None = None
    is_mono_linked: bool
    linked_at: datetime | None = None
    unlinked_at: datetime | None = None
    is_active: bool
    requires_reauth: bool
    deleted_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SyncStatusResponse(BaseModel):
    syncing: bool
    last_synced_at: datetime | None
