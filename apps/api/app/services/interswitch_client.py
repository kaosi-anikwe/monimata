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
Interswitch API client.

Two distinct API surfaces:
  1. Passport / Identity — BVN verification (uses INTERSWITCH_BASE_URL /
     INTERSWITCH_PASSPORT_URL).
  2. Quickteller — Bill payment (uses INTERSWITCH_QUICKTELLER_URL).

Both share the same OAuth 2.0 client-credentials token.  The token is cached in
Redis to avoid a round-trip on every call.

Auth-header difference (ISW docs are inconsistent):
  - Passport + Quickteller GET calls  → "Authorization: Bearer <token>"
  - Quickteller POST (payment advice) → "Authentication: Bearer <token>"
We set the correct header per call.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from typing import cast
from datetime import timedelta

import httpx

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

TOKEN_CACHE_KEY = "interswitch:access_token"
TOKEN_CACHE_KEY_OWN = "interswitch:access_token:own"
TOKEN_TTL_BUFFER_SECONDS = 60  # refresh 60 s before actual expiry


class InterswitchClient:
    """
    Interswitch API client.

    Creates a fresh httpx.AsyncClient per call so it is safe to use from Celery
    tasks that each run in their own short-lived event loop.
    """

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=30.0)

    # ── OAuth token ───────────────────────────────────────────────────────────

    async def _get_access_token(self, *, own: bool = False) -> str:
        """
        Fetch (or return a cached) Interswitch OAuth 2.0 access token.

        own=False (default): uses the ISW-developer-provided test credentials
            (INTERSWITCH_CLIENT_ID / INTERSWITCH_CLIENT_SECRET).  Used for all
            VAS calls: biller discovery, customer validation, bill payment advice.

        own=True: uses our own Quickteller Business credentials
            (INTERSWITCH_OWN_CLIENT_ID / INTERSWITCH_OWN_CLIENT_SECRET).  Used
            exclusively for the Web Checkout Collections re-query
            (verify_web_payment), which must be authenticated as the merchant
            that originally created the checkout transaction.

        Each credential set is cached under a separate Redis key so the two
        tokens never overwrite each other.
        """
        cache_key = TOKEN_CACHE_KEY_OWN if own else TOKEN_CACHE_KEY
        client_id = (
            settings.INTERSWITCH_OWN_CLIENT_ID if own else settings.INTERSWITCH_CLIENT_ID
        )
        client_secret = (
            settings.INTERSWITCH_OWN_CLIENT_SECRET
            if own
            else settings.INTERSWITCH_CLIENT_SECRET
        )

        r = get_redis()
        cached = cast(str | None, r.get(cache_key))
        if cached:
            return cached if isinstance(cached, str) else cached.decode()

        credentials = base64.b64encode(
            f"{client_id}:{client_secret}".encode()
        ).decode()

        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_PASSPORT_URL}/passport/oauth/token",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()
            data = response.json()

        access_token: str = data["access_token"]
        expires_in: int = int(data.get("expires_in", 3600))
        ttl = max(expires_in - TOKEN_TTL_BUFFER_SECONDS, 30)
        r.setex(cache_key, timedelta(seconds=ttl), access_token)
        return access_token

    def _headers(
        self, token: str, *, auth_key: str = "Authorization"
    ) -> dict[str, str]:
        """Build common headers.  auth_key differs for Quickteller payment POST."""
        return {
            auth_key: f"Bearer {token}",
            "Content-Type": "application/json",
            "TerminalId": settings.INTERSWITCH_TERMINAL_ID,
        }

    @property
    def _qt(self) -> str:
        """Quickteller base URL (no trailing slash)."""
        return settings.INTERSWITCH_QUICKTELLER_URL.rstrip("/")

    # ── BVN lookup ────────────────────────────────────────────────────────────

    async def lookup_bvn(self, bvn: str) -> dict:
        """
        Call Interswitch Passport to retrieve BVN holder details.
        Returns a dict with at least: first_name, last_name, date_of_birth.
        Raises httpx.HTTPStatusError on API failure.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.post(
                f"{settings.INTERSWITCH_BASE_URL}/verify/identity/bvn/verify",
                headers=self._headers(token),
                json={"id": bvn},
            )
            response.raise_for_status()
            return response.json()

    # ── Quickteller — biller discovery ───────────────────────────────────────

    async def get_biller_categories(self) -> list[dict]:
        """
        GET /quicktellerservice/api/v5/services/categories
        Returns a list of biller-category dicts with keys:
        categoryId, categoryName, description, pictureId, categoryType.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{self._qt}/services",
                headers=self._headers(token),
            )
            response.raise_for_status()
            data = response.json()
        # Actual ISW envelope: {"BillerList": {"Category": [...], "Count": N}}
        return data.get("BillerList", {}).get("Category", [])

    async def get_billers_by_category(self, category_id: str) -> list[dict]:
        """
        GET /quicktellerservice/api/v5/services?categoryId={id}
        Returns billers in the given category.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{self._qt}/services",
                params={"categoryId": category_id},
                headers=self._headers(token),
            )
            response.raise_for_status()
            data = response.json()
        # Actual ISW envelope: {"BillerList": {"Category": [{"Billers": [...]}]}}
        categories = data.get("BillerList", {}).get("Category", [])
        return categories[0].get("Billers", []) if categories else []

    async def get_biller_payment_items(self, biller_id: str) -> list[dict]:
        """
        GET /quicktellerservice/api/v5/services/{billerId}/paymentitems
        Returns payment items (services) for a biller, each with a PaymentCode.
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{self._qt}/services/options",
                headers=self._headers(token),
                params={"serviceid": biller_id},
            )
            response.raise_for_status()
            data = response.json()
        # Actual ISW envelope: {"PaymentItems": [...]}
        return data.get("PaymentItems", [])

    # ── Quickteller — customer validation ────────────────────────────────────

    async def validate_customer(self, payment_code: str, customer_id: str) -> dict:
        """
        POST /quicktellerservice/api/v5/Transactions/validatecustomers
        Body: {"customers": [{"PaymentCode": "...", "CustomerId": "..."}], "TerminalId": "..."}
        Returns the first customer validation result dict.
        """
        token = await self._get_access_token()
        payload = {
            "customers": [{"PaymentCode": payment_code, "CustomerId": customer_id}],
            "TerminalId": settings.INTERSWITCH_TERMINAL_ID,
        }
        headers = self._headers(token)
        headers["terminalId"] = settings.INTERSWITCH_TERMINAL_ID
        async with self._client() as http:
            response = await http.post(
                f"{self._qt}/Transactions/validatecustomers",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        # ISW wraps results in {"Customers": [<result>]} — unwrap the first entry.
        customers = data.get("Customers") or data.get("customers", [])
        return customers[0] if customers else data

    # ── Quickteller — payment ─────────────────────────────────────────────────

    async def initiate_payment(
        self,
        *,
        request_reference: str,
        payment_code: str,
        customer_id: str,
        amount: int,  # kobo — converted to string per ISW contract
        customer_mobile: str = "",
        customer_email: str = "",
    ) -> dict:
        """
        POST /quicktellerservice/api/v5/Transactions
        Executes the actual bill payment.  amount must be in kobo.
        ISW's bill payment POST uses "Authentication" header (not "Authorization").
        """
        token = await self._get_access_token()
        payload = {
            "TerminalId": settings.INTERSWITCH_TERMINAL_ID,
            "paymentCode": payment_code,
            "customerId": customer_id,
            "customerMobile": customer_mobile,
            "customerEmail": customer_email,
            # ISW expects amount as a string in kobo.
            "amount": str(amount),
            "requestReference": request_reference,
        }
        async with self._client() as http:
            response = await http.post(
                f"{self._qt}/Transactions",
                headers=self._headers(token),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    # ── Quickteller — query ───────────────────────────────────────────────────

    async def query_payment_status(self, request_reference: str) -> dict:
        """
        GET /quicktellerservice/api/v5/Transactions?requestRef={reference}
        """
        token = await self._get_access_token()
        async with self._client() as http:
            response = await http.get(
                f"{self._qt}/Transactions",
                params={"requestRef": request_reference},
                headers=self._headers(token),
            )
            response.raise_for_status()
            return response.json()

    # ── Web Checkout (Phase 2) ────────────────────────────────────────────────

    def build_checkout_html(
        self,
        *,
        ref: str,
        amount_kobo: int,
        cust_email: str,
        site_redirect_url: str,
    ) -> str:
        """
        Return an HTML page containing an auto-submitting form that POSTs the
        user's browser to the Interswitch Web Checkout page.

        The app backend serves this as GET /bills/checkout/{ref} so that the
        mobile WebView can load it without embedding sensitive merchant config
        on the client side.
        """
        checkout_url = settings.INTERSWITCH_WEB_CHECKOUT_URL
        merchant_code = settings.INTERSWITCH_MERCHANT_CODE
        pay_item_id = settings.INTERSWITCH_PAY_ITEM_ID

        return f"""
            <!doctype html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <title>Redirecting to secure payment…</title>
            </head>
            <body>
                <p style="font-family: sans-serif; text-align: center; margin-top: 40px">
                Redirecting to secure payment&hellip;
                </p>
                <form id="f" method="POST" action="{checkout_url}">
                <input type="hidden" name="merchant_code" value="{merchant_code}" />
                <input type="hidden" name="pay_item_id" value="{pay_item_id}" />
                <input type="hidden" name="txn_ref" value="{ref}" />
                <input type="hidden" name="amount" value="{amount_kobo}" />
                <input type="hidden" name="currency" value="566" />
                <input type="hidden" name="cust_email" value="{cust_email}" />
                <input
                    type="hidden"
                    name="site_redirect_url"
                    value="{site_redirect_url}"
                />
                </form>
                <script>
                document.getElementById("f").submit();
                </script>
            </body>
            </html>
        """

    async def verify_web_payment(self, ref: str, amount_kobo: int) -> dict:
        """
        Re-query Interswitch Collections API to confirm a Web Checkout payment.

        GET /collections/api/v1/gettransaction.json
            ?merchantcode={mc}&transactionreference={ref}&amount={amount_kobo}

        Returns the raw ISW response dict.  Callers should check
        result["ResponseCode"] == "00" for success.

        Uses our own Quickteller Business credentials (own=True) because the
        Collections API authenticates against the merchant that created the
        original Web Checkout transaction — not the ISW test credentials.
        """
        token = await self._get_access_token(own=True)
        collections_base = settings.INTERSWITCH_COLLECTIONS_URL.rstrip("/")
        async with self._client() as http:
            response = await http.get(
                f"{collections_base}/gettransaction.json",
                params={
                    "merchantcode": settings.INTERSWITCH_MERCHANT_CODE,
                    "transactionreference": ref,
                    "amount": str(amount_kobo),
                },
                headers=self._headers(token),
            )
            response.raise_for_status()
            return response.json()

    async def aclose(self) -> None:
        pass  # no persistent client to close


# Singleton — re-used across requests
interswitch_client = InterswitchClient()


def verify_interswitch_webhook(body: bytes, signature: str) -> bool:
    """
    Verify an Interswitch webhook event signature.

    Interswitch signs each webhook payload with HMAC-SHA512 using the webhook
    secret configured in the Developer Console.  The resulting hex digest is
    sent in the ``x-interswitch-signature`` request header.

    Returns True if the signature is valid, False otherwise.
    An empty INTERSWITCH_WEBHOOK_SECRET means verification is disabled (dev
    convenience only — always set in production).
    """
    secret = settings.INTERSWITCH_WEBHOOK_SECRET
    if not secret:
        logger.warning(
            "INTERSWITCH_WEBHOOK_SECRET is not set — webhook signature verification skipped"
        )
        return True

    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.lower())
