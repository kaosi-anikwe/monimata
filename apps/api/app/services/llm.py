# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

"""BYOK LLM categorisation service (Tier 4 fallback).

Supports two providers:
  - "gemini"  → Gemini 1.5 Flash via Google Generative Language REST API
  - "openai"  → GPT-4o-mini via OpenAI Chat Completions API

Both paths accept a batch of transactions and return structured JSON so that
a single API call handles many transactions at once.

This module must only be imported inside Celery tasks — never in the request
path.  The decrypted API key is held in a local variable and discarded when
the function returns; it is never logged or attached to any exception.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Prompt builder ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a financial transaction categorisation assistant for Nigerian bank transactions.
Your job is to assign each transaction to the most appropriate category from the user's
predefined list.  Return ONLY valid JSON — no markdown fences, no commentary.

Response schema:
{
  "results": [
    {"tx_id": "<id>", "category": "<category_name or null>", "confidence": <0-100>}
  ]
}

Rules:
- Only use categories from the provided list.
- If no category fits well, set category to null and confidence to 0.
- confidence reflects your certainty (0-100).
- Every tx_id in the input must appear exactly once in results.
"""


def _build_prompt(
    transactions: list[dict[str, str]],
    categories: list[str],
) -> str:
    """Build the user message for the LLM."""
    cat_list = "\n".join(f"- {c}" for c in categories)
    tx_list = "\n".join(
        f'- tx_id: "{t["id"]}", narration: "{t["narration"]}"' for t in transactions
    )
    return f"User categories:\n{cat_list}\n\nTransactions to categorise:\n{tx_list}"


# ── Provider implementations ──────────────────────────────────────────────────


def _call_openai(
    api_key: str,
    transactions: list[dict[str, str]],
    categories: list[str],
) -> tuple[list[dict[str, Any]], int, int]:
    """Call GPT-4o-mini. Returns (results_list, prompt_tokens, completion_tokens)."""
    user_msg = _build_prompt(transactions, categories)
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    usage = body.get("usage", {})
    content = body["choices"][0]["message"]["content"]
    data = json.loads(content)
    return data["results"], usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)


def _call_gemini(
    api_key: str,
    transactions: list[dict[str, str]],
    categories: list[str],
) -> tuple[list[dict[str, Any]], int, int]:
    """Call Gemini 1.5 Flash. Returns (results_list, prompt_tokens, completion_tokens)."""
    user_msg = _build_prompt(transactions, categories)
    full_prompt = f"{_SYSTEM_PROMPT}\n\n{user_msg}"
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    resp = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    usage = body.get("usageMetadata", {})
    content = body["candidates"][0]["content"]["parts"][0]["text"]
    data = json.loads(content)
    return (
        data["results"],
        usage.get("promptTokenCount", 0),
        usage.get("candidatesTokenCount", 0),
    )


# ── Public interface ──────────────────────────────────────────────────────────


class LlmHttpError(Exception):
    """Wraps an httpx.HTTPStatusError for structured handling in the Celery task."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


def call_llm(
    provider: str,
    api_key: str,
    transactions: list[dict[str, str]],
    categories: list[str],
) -> tuple[list[dict[str, Any]], int, int]:
    """Dispatch to the correct provider and surface HTTP errors as LlmHttpError."""
    try:
        if provider == "openai":
            return _call_openai(api_key, transactions, categories)
        elif provider == "gemini":
            return _call_gemini(api_key, transactions, categories)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider!r}")
    except httpx.HTTPStatusError as exc:
        raise LlmHttpError(exc.response.status_code, str(exc)) from exc
