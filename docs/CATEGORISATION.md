# Transaction Auto-Categorisation — System Reference

MoniMata automatically categorises incoming transactions using a tiered pipeline that flows from fast, free, deterministic lookups down to costlier semantic and AI layers — stopping as soon as a confident match is found. The system is designed so that over 90% of transactions are resolved without any external API call.

---

## Architecture Overview

```
[Inbound Transaction]
        │
        ▼
[Narration Cleaning Pipeline]      ←── Strips refs, account numbers, protocol tokens
        │  cleaned_narration stored on the Transaction row
        ▼
[Tier 1: Exact-Match Cache]        ←── UserCategoryRule table (O(1) indexed lookup)
        │  hit? → 100% confidence, stop
        ▼
[Tier 2a: Global Merchant Registry] ←── global_merchants.json substring match
        │  hit? → 90% confidence, stop
        ▼
[Tier 2b: Keyword Regex Rules]     ←── Hardcoded patterns (airtime, salary, rent, etc.)
        │  hit? → 75% confidence, stop
        ▼
[Tier 2c: Vector Similarity]       ←── pgvector cosine search against UserCategoryRule embeddings
        │  hit? → 70–95% confidence, stop
        ▼
[Tier 3: Heuristic Scoring Engine] ←── rapidfuzz candidates + multi-factor rule scoring
        │  hit? → 75–100% confidence, stop
        ▼
[Tier 4: BYOK LLM Fallback]       ←── User's own API key (Gemini / OpenAI / Anthropic)
        │  hit? → LLM-reported confidence, stop
        ▼
[Uncategorised]                    ←── Surfaces in the review queue for manual assignment
```

When a transaction is manually categorised (or a suggestion is confirmed), a `UserCategoryRule` row is upserted — feeding future Tier 1 exact matches and Tier 2c vector lookups. The system learns from every user interaction.

### Key modules

| Module | Responsibility |
|--------|---------------|
| `app/services/categorization/__init__.py` | Pipeline orchestrator: `categorize_transaction()`, `get_category_suggestions()`, narration cleaning, global merchant loading |
| `app/services/categorization/scoring.py` | Tier 3 heuristic engine: `ScoringComponent` interface, `TransactionTypeRule`, `AmountBracketRule`, `TemporalPatternRule`, `HeuristicEngine` |
| `app/services/categorization/embeddings.py` | Tier 2c vector layer: `all-MiniLM-L6-v2` model singleton, `encode()` |
| `app/services/categorization/clustering.py` | Cold-start onboarding: Levenshtein clustering for the Cluster Blitz UX |
| `app/services/categorization/global_merchants.json` | Community-maintained merchant → category token registry |
| `app/services/llm.py` | Tier 4 BYOK LLM: Gemini Flash, GPT-4o-mini, Claude Haiku dispatchers |
| `app/models/user_category_rule.py` | Tier 1 exact-match cache + Tier 2c embedding store |
| `app/models/user_ai_credential.py` | Fernet-encrypted BYOK API key storage |
| `app/models/user_ai_usage_log.py` | Per-call token accounting for AI efficiency dashboard |

---

## Narration Cleaning

Before any categorisation logic runs, the raw bank narration is passed through a deterministic regex pipeline that strips noise:

```
Raw:     "TRF FROM 0023423423 TO CHINEDU ENTERPRISES VIA USSD REF:71625372/IKEJA"
Cleaned: "chinedu enterprises"
```

The pipeline removes:
- Protocol prefixes (`TRF FROM`, `NIP TRSF FRM`, `POS PURCHASE AT`, etc.)
- Reference codes (`REF:`, `SESN:`, `TXN:`, `FT`, etc.)
- Inline account numbers (`TO 0023423423`)
- Date fragments (`12/05/2026`)
- Long numeric sequences (7+ digits)
- Trailing channel indicators (`VIA USSD`, `VIA MOBILE APP`)
- Special characters (replaced with spaces)

The result is a lowercase, whitespace-normalised string (max 255 chars) stored as `Transaction.cleaned_narration`. All downstream tiers match against this cleaned key.

---

## Tier 1: Exact-Match Cache

The fastest path. When a user manually categorises a transaction (or confirms a suggestion), a `UserCategoryRule` row is upserted with the transaction's `cleaned_narration` as the key:

```sql
SELECT category_id FROM user_category_rules
WHERE user_id = :uid AND cleaned_narration = :key
```

The composite unique index `(user_id, cleaned_narration)` makes this an O(1) B-Tree lookup.

**On hit**: `hit_count` is incremented, `last_triggered` is updated, confidence is set to 100%, and the pipeline terminates.

**Source tag**: `exact_match`

---

## Tier 2a: Global Merchant Registry

A community-maintained JSON file (`global_merchants.json`) maps well-known Nigerian merchant substrings to canonical category names:

```json
{
  "chicken republic": "Food & Dining",
  "mtn vtu": "Airtime & Data",
  "dstv": "Entertainment",
  "ubertrip": "Transport",
  "ikedc": "Utilities & Bills"
}
```

The engine does a simple substring check: if any token appears in the `cleaned_narration`, the transaction is assigned to the matching category.

Category resolution uses a three-step fallback:
1. **Substring ilike** — `"Groceries"` matches `"Food & Groceries"`
2. **Word-token ilike** — each word (≥4 chars) is tried individually
3. **Fuzzy match** — `rapidfuzz.token_set_ratio` against all user categories (threshold: 65)

This ensures users whose categories are named differently from the canonical registry still get matches.

**Source tag**: `global_merchant` · **Confidence**: 90

---

## Tier 2b: Keyword Regex Rules

Hardcoded regex patterns catch common transaction types that are structurally recognisable:

| Pattern | Category |
|---------|----------|
| `airtime \| recharge \| vtu` | Airtime & Data |
| `data subscription \| data plan` | Airtime & Data |
| `salary \| payroll \| wages` | Income |
| `cash withdrawal \| atm` | Cash |
| `rent \| landlord` | Rent |
| `hospital \| pharmacy \| clinic` | Healthcare |
| `school fees \| tuition` | Education |
| `fuel \| petrol` | Transport |

The keyword check uses the extended key (`cleaned_narration` + user memo if present).

**Source tag**: `keyword` · **Confidence**: 75

---

## Tier 2c: Vector Similarity Search

When `UserCategoryRule` rows have embeddings (generated asynchronously by the `embed_category_rule` Celery task), the engine performs a pgvector cosine distance search:

```sql
SELECT category_id, (embedding <=> CAST(:vec AS vector)) AS distance
FROM user_category_rules
WHERE user_id = :uid AND embedding IS NOT NULL
ORDER BY embedding <=> CAST(:vec AS vector)
LIMIT 1
```

The query embedding is computed using `all-MiniLM-L6-v2` (384 dimensions, ~90 MB). The model is loaded once per Celery worker process via the `worker_process_init` signal.

**Distance threshold**: 0.25 (cosine distance). Distances beyond this are rejected.

**Confidence scaling**: Distance `[0, 0.25]` maps to confidence `[95, 70]`:

$$\text{confidence} = 95 - \frac{\text{distance}}{0.25} \times 25$$

This tier catches close variations like `"chicken republik ija"` matching a rule for `"chicken republic lekki"`.

**Source tag**: `vector` · **Confidence**: 70–95

---

## Tier 3: Heuristic Scoring Engine

A modular, pluggable scoring system that combines fuzzy text matching with domain-specific financial rules.

### Architecture

```python
class ScoringComponent(ABC):
    @abstractmethod
    def calculate_score(self, context: ScoringContext, candidate: CandidateCategory) -> int:
        """Return a signed integer modifier to adjust candidate confidence."""
```

Each component is an isolated scoring rule. Components are registered in `HeuristicEngine.__init__` — adding a new rule means adding one class and one line.

### Candidate generation

Candidates are generated by computing `rapidfuzz.token_sort_ratio` between the cleaned narration and every `UserCategoryRule.cleaned_narration` for the user. Only candidates with a score ≥ 60 survive.

### Scoring components

#### 1. TransactionTypeRule

Enforces directional validation. If the transaction is a debit but the candidate category is income-only (salary, dividends, refunds), it applies a **-100 modifier** — effectively eliminating the candidate.

#### 2. AmountBracketRule

Adjusts confidence based on amount plausibility for the category:

| Category fragment | Amount range | Modifier |
|-------------------|-------------|----------|
| `airtime` | ₦0 – ₦10,000 | +20 |
| `airtime` | ₦10,000 – ₦50,000 | 0 |
| `airtime` | > ₦50,000 | -60 |
| `food` | ₦0 – ₦5,000 | +15 |
| `food` | > ₦50,000 | -30 |
| `transport` | ₦0 – ₦3,000 | +15 |
| `transport` | > ₦50,000 | -20 |

A ₦350,000 "airtime" transaction gets penalised heavily because it's an implausible amount for that category.

#### 3. TemporalPatternRule

Boosts recurring-expense categories (rent, insurance, subscriptions) when a similar-amount transaction appeared 28–32 days ago (±10% variance). Applies a **+40 modifier**.

This catches monthly bills even when the narration varies slightly between billing cycles.

### Confidence threshold

A candidate must reach a combined score ≥ **75** to be committed. Below that, the transaction passes to Tier 4.

**Source tag**: `heuristic` · **Confidence**: 75–100

---

## Tier 4: BYOK LLM Fallback

When Tiers 1–3 fail, transactions are batched per-user and sent to the LLM if the user has configured a BYOK API key.

### Supported providers

| Provider | Model | Endpoint |
|----------|-------|----------|
| Gemini | Gemini 1.5 Flash | Google Generative Language REST API |
| OpenAI | GPT-4o-mini | Chat Completions API |
| Anthropic | Claude 3.5 Haiku | Messages API |

### How it works

1. The `categorize_transactions` task collects all transactions that failed Tiers 1–3
2. It enqueues `run_llm_categorization` per user
3. The task decrypts the user's API key (Fernet AES-128-CBC + HMAC-SHA256), calls the provider with the user's category list and transaction narrations, then maps the results back
4. The plaintext key is held in a local variable and discarded when the function returns — never logged or attached to any exception

### Prompt structure

The LLM receives a system prompt defining the JSON response schema, plus a user message listing the user's categories and the transactions to classify. Temperature is set to 0 for deterministic output.

### Error handling

- **HTTP 429 / 5xx** (rate limit / provider outage): exponential backoff, 3 retries, then fall through to manual review
- **HTTP 401 / 402** (key expired / credits exhausted): `is_active` set to `False`, push notification sent to the user, further LLM calls halted

### Privacy boundary

The platform never sees or stores the user's API key in plaintext. The entire Tier 4 execution happens inside the user's billing sandbox. MoniMata incurs $0 marginal cost.

**Source tag**: `llm`

---

## Cold-Start Onboarding

When a user uploads a 3-month bank statement, hundreds of transactions arrive at once. Presenting them individually causes categorisation fatigue. MoniMata reduces this with **Levenshtein clustering**.

### Algorithm

1. Unique `cleaned_narration` strings are aggregated via `GROUP BY` — compressing O(N) transactions to O(K) unique narrations
2. Narrations are sorted by frequency (most common first)
3. A greedy single-pass assigns each narration to the first cluster whose key is within the normalised Levenshtein distance threshold (0.30 = 70% character similarity)

### Result

45 separate `"spar supermarket lekki"`, `"spar wuse"`, `"spar victoria island"` entries become one card:

> **SPAR Supermarket** — 45 transactions · ₦84,200 total
>
> `[ 🛒 Groceries ]` `[ 🍔 Dining Out ]` `[ 🏪 Shopping ]`

Tapping a category chip batch-updates all 45 transactions and creates a `UserCategoryRule` for future exact matches. This compresses historical datasets by up to 85%.

### Cluster resolution

```python
from app.services.categorization.clustering import build_clusters

clusters = build_clusters(rows)  # rows: list[(narration, count, total_amount)]
```

Each `NarrationCluster` has: `key` (representative narration), `member_narrations`, `count`, `total_amount`.

---

## Review Queue Suggestions

`GET /transactions/review-queue` returns uncategorised transactions with ranked suggestions. The `get_category_suggestions()` function runs a parallel sweep through all tiers (except Tier 4) and returns up to 3 candidates:

```json
[
  { "category_id": "cat-123", "category_name": "Groceries", "confidence": 90, "source": "global_merchant" },
  { "category_id": "cat-456", "category_name": "Food & Dining", "confidence": 78, "source": "heuristic" },
  { "category_id": "cat-789", "category_name": "Shopping", "confidence": 65, "source": "heuristic" }
]
```

Candidates are deduplicated by `category_id` and sorted by confidence descending.

---

## Telemetry Fields

Every transaction carries telemetry from the categorisation pipeline:

| Field | Type | Description |
|-------|------|-------------|
| `categorization_source` | `string` | Which tier assigned the category: `exact_match`, `global_merchant`, `keyword`, `vector`, `heuristic`, `llm`, `manual` |
| `category_confidence` | `int` | 0–100 score set by the assigning tier |
| `cleaned_narration` | `string` | Normalised narration key used for lookups and clustering |

These fields drive the AI efficiency dashboard that shows the user what percentage of their transactions were resolved offline vs. by the LLM.

---

## AI Usage Tracking

Every LLM call writes a row to `user_ai_usage_logs` with:

| Field | Description |
|-------|-------------|
| `provider` | `"gemini"`, `"openai"`, or `"anthropic"` |
| `prompt_tokens` | Input tokens consumed |
| `completion_tokens` | Output tokens consumed |
| `timestamp` | When the call was made |

The dashboard aggregates these to show monthly token volume, estimated cost, and offline success rate.

---

## Extending the System

### Adding a global merchant

Edit `app/services/categorization/global_merchants.json`:

```json
{
  "new merchant name": "Category Name"
}
```

Tokens are lowercase substrings matched against `cleaned_narration`. Keep them specific enough to avoid false positives.

### Adding a keyword rule

Append to `KEYWORD_RULES` in `app/services/categorization/__init__.py`:

```python
KEYWORD_RULES.append(
    (re.compile(r"new_pattern", re.IGNORECASE), "Target Category"),
)
```

### Adding a heuristic scoring component

1. Create a class implementing `ScoringComponent`
2. Append an instance to `HeuristicEngine.components`

```python
class PublicHolidayRule(ScoringComponent):
    def calculate_score(self, context, candidate):
        # Boost gifting categories during festive periods
        ...
        return +25
```

No changes to models, the pipeline, or the database required.

### Adding a new LLM provider

Implement a `_call_<provider>()` function in `app/services/llm.py` following the existing pattern, add the provider string to the dispatch in `call_llm()`, and add a validation path in `validate_api_key()`.
