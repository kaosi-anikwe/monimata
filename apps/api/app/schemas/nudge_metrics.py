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

"""Pydantic schemas for per-user nudge insight endpoints."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class UserNudgeInsightRule(BaseModel):
    slug: str
    count: int
    delivered: int
    suppressed: int
    categories: list[str]


class UserNudgeInsights(BaseModel):
    period_start: date
    period_end: date
    total_nudges: int
    total_suppressed: int
    opened: int
    dismissed: int
    top_rules: list[UserNudgeInsightRule]
