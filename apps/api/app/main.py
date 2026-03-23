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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import configure_logging

configure_logging(log_dir=settings.LOG_DIR, log_level=settings.LOG_LEVEL)

from app.routers import (
    auth,
    accounts,
    transactions,
    budget,
    categories,
    nudges,
    recurring,
    reports,
    sync,
    content,
    webhooks,
    bills,
)

app = FastAPI(
    title="MoniMata API",
    description="Zero-based budgeting for Nigerians — Every Kobo, Accounted For.",
    version="0.0.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
app.include_router(categories.router, prefix="/categories", tags=["categories"])
app.include_router(
    categories.groups_router, prefix="/category-groups", tags=["categories"]
)
app.include_router(nudges.router, prefix="/nudges", tags=["nudges"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(content.router, prefix="/content", tags=["content"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(bills.router, prefix="/bills", tags=["bills"])
app.include_router(recurring.router, prefix="/recurring-rules", tags=["recurring"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "monimata-api"}
