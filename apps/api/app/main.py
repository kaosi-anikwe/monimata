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

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from rich.console import Console
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging_config import configure_logging

configure_logging(log_dir=settings.LOG_DIR, log_level=settings.LOG_LEVEL)

# Initialise Sentry before importing routers so every module is instrumented.
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
    )

from app.routers import (  # noqa: E402
    accounts,
    ai,
    auth,
    budget,
    categories,
    content,
    nudges,
    recurring,
    reports,
    sync,
    transactions,
    uploads,
    webhooks,
    ws,
)

_console = Console(stderr=True)

_docs_url = None if settings.ENV == "production" else "/docs"
_redoc_url = None if settings.ENV == "production" else "/redoc"
_openapi_url = None if settings.ENV == "production" else "/openapi.json"

app = FastAPI(
    title="MoniMata API",
    description="Zero-based budgeting for Nigerians — Every Kobo, Accounted For.",
    version="0.0.1",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


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
app.include_router(categories.groups_router, prefix="/category-groups", tags=["categories"])
app.include_router(nudges.router, prefix="/nudges", tags=["nudges"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(content.router, prefix="/content", tags=["content"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(recurring.router, prefix="/recurring-rules", tags=["recurring"])
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(ai.router, prefix="/ai/credentials", tags=["ai"])
app.include_router(ws.router, tags=["websocket"])


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=429, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Render unhandled exceptions with Rich and return a safe 500 response."""
    _console.print_exception(max_frames=5, show_locals=True, word_wrap=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "monimata-api"}
