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

"""
Push Notification Service

All notifications are sent through Expo's managed push API
(https://exp.host/--/api/v2/push/send).  Expo handles the last-mile delivery
to FCM (Android) and APNs (iOS) using credentials you register once via
`eas credentials`.  This works identically in Expo Go, local builds
(`npx expo run:android`), and EAS-built standalone apps — no Firebase Admin
SDK or google-services.json required on the backend.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_notification(
    token: str | None,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """
    Send a push notification via the Expo push API.

    Never raises.  Failures are logged at WARNING level and swallowed so they
    never break the caller's transaction or HTTP response.

    Args:
        token: Expo push token ("ExponentPushToken[...]").  No-op if None.
        title: Notification title.
        body:  Notification body text.
        data:  Optional key-value payload forwarded to the app.
    """
    if not token:
        return

    payload: dict = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
            )
            resp.raise_for_status()
            result = resp.json()
            ticket = result.get("data", {})
            if isinstance(ticket, list):
                ticket = ticket[0] if ticket else {}
            if ticket.get("status") == "error":
                logger.warning(
                    "push_service: Expo delivery error — %s",
                    ticket.get("message"),
                )
    except Exception:
        logger.warning(
            "push_service: failed to deliver notification (token=%s...)",
            token[:30],
            exc_info=True,
        )
