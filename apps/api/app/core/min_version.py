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

"""Minimum mobile-app version enforcement middleware.

How it works
------------
The mobile app sends its own version on every request::

    X-App-Version: 0.3.0

This middleware compares that value against ``MIN_APP_VERSION`` from the
environment.  If the client is below the minimum it receives:

    HTTP 426 Upgrade Required
    {"detail": "App update required", "min_version": "...", "update_url": "..."}

Behaviour matrix
~~~~~~~~~~~~~~~~
+-----------------------+--------------------+--------+
| MIN_APP_VERSION set?  | Header present?    | Result |
+=======================+====================+========+
| No (empty / "0.0.0")  | Either             | Allow  |
+-----------------------+--------------------+--------+
| Yes                   | Absent             | 426    |
+-----------------------+--------------------+--------+
| Yes                   | Present, >= min    | Allow  |
+-----------------------+--------------------+--------+
| Yes                   | Present, < min     | 426    |
+-----------------------+--------------------+--------+

When MIN_APP_VERSION is set, the header is **required** — requests without it
are rejected with 426.  This is intentional during active development when all
clients are expected to send the header.  Set MIN_APP_VERSION to empty (or
remove it from .env) to disable all enforcement.

Exempt paths
~~~~~~~~~~~~
Only application routes are checked. Anything not in the protected list passes
through without a version header — this includes /health, /webhooks/*, /docs,
/redoc, /openapi.json, and any future internal paths added outside the app
route prefixes.
"""

from __future__ import annotations

import logging

from packaging.version import InvalidVersion, Version
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Only requests whose path starts with one of these prefixes are version-checked.
# /health and /webhooks/* are intentionally absent — they are server-to-server
# or infrastructure paths that never carry an app version header.
_PROTECTED_PREFIXES = (
    "/auth",
    "/accounts",
    "/transactions",
    "/budget",
    "/categories",
    "/category-groups",
    "/nudges",
    "/reports",
    "/sync",
    "/content",
    "/recurring-rules",
    "/uploads",
    "/ai",
    "/ws",
    "/admin",
)


class MinAppVersionMiddleware(BaseHTTPMiddleware):
    """Reject requests from mobile clients below the configured minimum version."""

    def __init__(
        self,
        app,
        min_version: str,
        android_url: str = "",
        ios_url: str = "",
    ) -> None:
        super().__init__(app)
        self._android_url = android_url
        self._ios_url = ios_url

        if not min_version or min_version == "0.0.0":
            self._min: Version | None = None  # enforcement disabled
        else:
            try:
                self._min = Version(min_version)
            except InvalidVersion:
                logger.error(
                    "MIN_APP_VERSION=%r is not a valid version string — "
                    "client version enforcement is DISABLED",
                    min_version,
                )
                self._min = None

    def _update_url(self, request: Request) -> str:
        """Return the store URL matching the client platform, or empty string."""
        platform = request.headers.get("X-App-Platform", "").lower()
        if platform == "android" and self._android_url:
            return self._android_url
        if platform == "ios" and self._ios_url:
            return self._ios_url
        # Fall back to whichever URL is configured when platform is unknown.
        return self._android_url or self._ios_url

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        # Enforcement disabled — let everything through.
        if self._min is None:
            return await call_next(request)

        # Only enforce on protected application routes.
        if not any(request.url.path.startswith(p) for p in _PROTECTED_PREFIXES):
            return await call_next(request)

        header = request.headers.get("X-App-Version")

        # No header — required when enforcement is active.
        if header is None:
            url = self._update_url(request)
            return JSONResponse(
                status_code=426,
                content={
                    "detail": "X-App-Version header is required",
                    "min_version": str(self._min),
                    **(({"update_url": url}) if url else {}),
                },
            )

        try:
            client_version = Version(header)
        except InvalidVersion:
            logger.warning("Invalid X-App-Version header value: %r", header)
            return JSONResponse(
                status_code=400,
                content={"detail": f"Invalid X-App-Version header: {header!r}"},
            )

        if client_version < self._min:
            logger.info(
                "Rejected client version %s (minimum %s) for %s %s",
                client_version,
                self._min,
                request.method,
                request.url.path,
            )
            url = self._update_url(request)
            body: dict[str, str] = {
                "detail": "App update required",
                "min_version": str(self._min),
            }
            if url:
                body["update_url"] = url
            return JSONResponse(status_code=426, content=body)

        return await call_next(request)
