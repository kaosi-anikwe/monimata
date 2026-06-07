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

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from rich.console import Console
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging_config import configure_logging
from app.core.min_version import MinAppVersionMiddleware

# Import registers SQLAlchemy event listeners on Transaction (insert/update/delete).
from app.services import budget_events as _budget_events  # noqa: F401

configure_logging(log_dir=settings.LOG_DIR, log_level=settings.LOG_LEVEL)

import logging  # noqa: E402 — after configure_logging

_startup_logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Warm caches and run any pre-flight setup before the server starts accepting requests."""
    from app.core.database import SessionLocal
    from app.core.redis_client import warm_nudge_rule_cache

    db = SessionLocal()
    try:
        warm_nudge_rule_cache(db)
    except Exception:
        _startup_logger.warning(
            "warm_nudge_rule_cache failed at startup — workers will rebuild on first miss",
            exc_info=True,
        )
    finally:
        db.close()

    yield
    # Shutdown — nothing to clean up


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

_redoc_url = None if settings.ENV == "production" else "/redoc"
_openapi_url = None if settings.ENV == "production" else "/openapi.json"

app = FastAPI(
    title="MoniMata API",
    description="Zero-based budgeting for Nigerians — Every Kobo, Accounted For.",
    version="0.3.0",
    docs_url=None,  # replaced by custom endpoint below
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
    lifespan=_lifespan,
)

# ── Custom Swagger UI with default headers ──────────────────────────────────
# Injects X-App-Version and X-App-Platform into every request made from the
# interactive docs so the MinAppVersionMiddleware doesn't block them.
if settings.ENV != "production":
    from fastapi.openapi.docs import get_swagger_ui_html
    from fastapi.responses import HTMLResponse

    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_ui() -> HTMLResponse:
        base = get_swagger_ui_html(
            openapi_url=app.openapi_url or "/openapi.json",
            title=f"{app.title} — Swagger UI",
        )
        # Inject a requestInterceptor as live JS (not a JSON string) into the
        # SwaggerUIBundle config so every request carries the required headers.
        patched = (
            bytes(base.body)
            .decode()
            .replace(
                "presets: [",
                "requestInterceptor: (req) => {"
                " req.headers['X-App-Version'] = '99.0.0';"
                " req.headers['X-App-Platform'] = 'android';"
                " return req;"
                " },\n    presets: [",
            )
        )
        return HTMLResponse(patched)


app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    MinAppVersionMiddleware,
    min_version=settings.MIN_APP_VERSION,
    android_url=settings.APP_UPDATE_URL_ANDROID,
    ios_url=settings.APP_UPDATE_URL_IOS,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(ai.usage_router, prefix="/ai", tags=["ai"])
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
