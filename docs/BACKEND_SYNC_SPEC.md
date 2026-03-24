# MoniMata — Backend Sync & WebSocket Specification

**For:** Backend engineering team  
**Created:** March 2026  
**Context:** The mobile app uses [WatermelonDB](https://watermelondb.dev/) as its local SQLite cache.
All financial state (transactions, budget allocations, categories, targets, recurring rules)
lives in WatermelonDB on-device and syncs with the server through exactly two REST endpoints
(`/sync/pull` and `/sync/push`) plus one WebSocket endpoint (`/ws/events`).

> **Note on the REST API:** The existing REST CRUD routes (`POST /transactions/manual`,
> `PATCH /budget/:categoryId`, etc.) are NOT being removed. They remain as the data layer
> for the upcoming web app. Only the mobile client uses the sync channel.

---

## 1. The WatermelonDB Sync Protocol

WatermelonDB uses a **pull → push** sync cycle. The mobile client calls both in sequence.
The protocol is documented fully at https://watermelondb.dev/docs/Sync/Backend.

### 1.1 Terminology

| Term             | Meaning                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `last_pulled_at` | Unix timestamp in **milliseconds** of the last successful pull. `null` on first sync (mobile caps this to 90 days ago). |
| `changes`        | A JSON object keyed by table name, each with three arrays: `created`, `updated`, `deleted`.                             |
| `timestamp`      | Server-side Unix timestamp in **milliseconds** to be used as `last_pulled_at` on the next pull.                         |

---

## 2. `GET /sync/pull`

### 2.1 Request

```
GET /sync/pull?last_pulled_at=<ms_timestamp>
Authorization: Bearer <jwt>
```

The mobile client also sends `schema_version` (integer) and `migration_syncs` (JSON string)
parameters when schema migrations are in flight — you can ignore these unless you implement
migration-aware sync (not required now).

### 2.2 Response

```json
{
  "changes": {
    "transactions": {
      "created": [ { "id": "...", "account_id": "...", ... } ],
      "updated": [ { "id": "...", "category_id": "...", ... } ],
      "deleted": [ "tx-id-1", "tx-id-2" ]
    },
    "category_groups": {
      "created": [],
      "updated": [],
      "deleted": []
    },
    "categories": { "created": [], "updated": [], "deleted": [] },
    "budget_months": { "created": [], "updated": [], "deleted": [] },
    "category_targets": { "created": [], "updated": [], "deleted": [] },
    "recurring_rules": { "created": [], "updated": [], "deleted": [] }
  },
  "timestamp": 1742505600000
}
```

**Rules:**

- All six tables must always be present in `changes`, even if their arrays are empty.
- `timestamp` must be the server's current time in **milliseconds** captured _before_ you
  query the database, so any writes that happen during the pull are included in the next cycle.
- `deleted` arrays contain **string IDs only**, not full objects.
- Only return rows belonging to the authenticated user (`user_id = current_user.id`).
- For `transactions`: only return rows where `updated_at > last_pulled_at`. Same for all tables.

### 2.3 Column mapping

WatermelonDB records use `snake_case` column names that map directly to the database schema below.
The mobile schema version is **4**. Return column names exactly as shown — do not camelCase them.

#### `transactions`

| Column          | Type          | Notes                                       |
| --------------- | ------------- | ------------------------------------------- |
| `id`            | string (UUID) | Primary key                                 |
| `account_id`    | string        | FK to user's Mono account                   |
| `user_id`       | string        | FK to user                                  |
| `mono_id`       | string?       | Mono transaction ID, nullable               |
| `date`          | number (ms)   | Unix timestamp in ms                        |
| `amount`        | number        | Integer kobo (smallest currency unit)       |
| `narration`     | string        | Bank narration / description                |
| `type`          | string        | `"debit"` or `"credit"`                     |
| `balance_after` | number?       | Account balance after transaction, nullable |
| `category_id`   | string?       | FK to categories, nullable                  |
| `memo`          | string?       | User note, nullable                         |
| `is_split`      | boolean       | Whether this is a split transaction         |
| `is_manual`     | boolean       | Whether manually entered by user            |
| `source`        | string        | `"mono"`, `"manual"`, `"import"`            |
| `recurrence_id` | string?       | FK to recurring_rules, nullable             |
| `created_at`    | number (ms)   |                                             |
| `updated_at`    | number (ms)   |                                             |

#### `category_groups`

| Column       | Type          |
| ------------ | ------------- |
| `id`         | string (UUID) |
| `user_id`    | string        |
| `name`       | string        |
| `sort_order` | number        |
| `is_hidden`  | boolean       |
| `created_at` | number (ms)   |
| `updated_at` | number (ms)   |

#### `categories`

| Column       | Type          | Notes                 |
| ------------ | ------------- | --------------------- |
| `id`         | string (UUID) |                       |
| `user_id`    | string        |                       |
| `group_id`   | string        | FK to category_groups |
| `name`       | string        |                       |
| `sort_order` | number        |                       |
| `is_hidden`  | boolean       |                       |
| `created_at` | number (ms)   |                       |
| `updated_at` | number (ms)   |                       |

#### `budget_months`

| Column        | Type          | Notes                                            |
| ------------- | ------------- | ------------------------------------------------ |
| `id`          | string (UUID) |                                                  |
| `user_id`     | string        |                                                  |
| `category_id` | string        | FK to categories                                 |
| `month`       | string        | Format: `"YYYY-MM"`                              |
| `assigned`    | number        | Kobo assigned to category this month             |
| `activity`    | number        | Kobo spent/received (computed from transactions) |
| `updated_at`  | number (ms)   | No `created_at` column                           |

#### `category_targets`

| Column          | Type          | Notes                                                 |
| --------------- | ------------- | ----------------------------------------------------- |
| `id`            | string (UUID) |                                                       |
| `category_id`   | string        | FK to categories                                      |
| `frequency`     | string        | `"weekly"` \| `"monthly"` \| `"yearly"` \| `"custom"` |
| `behavior`      | string        | `"set_aside"` \| `"refill"` \| `"balance"`            |
| `target_amount` | number        | Kobo                                                  |
| `day_of_week`   | number?       | 0–6, nullable                                         |
| `day_of_month`  | number?       | 1–31, nullable                                        |
| `target_date`   | string?       | ISO date string, nullable                             |
| `repeats`       | boolean       |                                                       |
| `created_at`    | number (ms)   |                                                       |
| `updated_at`    | number (ms)   |                                                       |

#### `recurring_rules`

| Column         | Type          | Notes                                                                              |
| -------------- | ------------- | ---------------------------------------------------------------------------------- |
| `id`           | string (UUID) |                                                                                    |
| `user_id`      | string        |                                                                                    |
| `frequency`    | string        | `"daily"` \| `"weekly"` \| `"biweekly"` \| `"monthly"` \| `"yearly"` \| `"custom"` |
| `interval`     | number        | Repeat interval (e.g. every 2 weeks)                                               |
| `day_of_week`  | number?       | nullable                                                                           |
| `day_of_month` | number?       | nullable                                                                           |
| `next_due`     | string        | ISO date string                                                                    |
| `ends_on`      | string?       | ISO date string, nullable                                                          |
| `is_active`    | boolean       |                                                                                    |
| `template`     | string        | JSON-encoded transaction template object                                           |
| `created_at`   | number (ms)   |                                                                                    |
| `updated_at`   | number (ms)   |                                                                                    |

---

## 3. `POST /sync/push`

### 3.1 Request

```
POST /sync/push
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "changes": {
    "transactions": {
      "created": [ { "id": "client-generated-uuid", "user_id": "...", ... } ],
      "updated": [ { "id": "existing-uuid", "category_id": "new-cat-id", ... } ],
      "deleted": [ "uuid-to-delete" ]
    },
    "category_groups": { "created": [], "updated": [], "deleted": [] },
    "categories": { "created": [], "updated": [], "deleted": [] },
    "budget_months": { "created": [], "updated": [], "deleted": [] },
    "category_targets": { "created": [], "updated": [], "deleted": [] },
    "recurring_rules": { "created": [], "updated": [], "deleted": [] }
  },
  "last_pulled_at": 1742505600000
}
```

### 3.2 Response

```
HTTP 200 OK
(empty body or {})
```

On conflict or validation error, return `HTTP 409` or `HTTP 422` with an error message.
The mobile client treats any non-2xx as a sync failure and will retry on next foreground.

### 3.3 Push processing rules

**Security (critical):**

- For every record in `created` and `updated`, verify `user_id === current_user.id`.
  Reject the entire push with `403` if any record belongs to a different user.
- For every id in `deleted`, verify the row belongs to `current_user.id` before deleting.
- IDs are client-generated UUIDs. Accept them as-is (do not re-generate on the server).

**Idempotency:**

- `created`: Upsert by `id`. If the row already exists (duplicate push), update it.
- `updated`: Upsert by `id`.
- `deleted`: Delete if exists; silently ignore if already gone.

**Post-push side effects (emit WebSocket events for these — see Section 4):**

| Table             | Created/Updated    | What to trigger                                                   |
| ----------------- | ------------------ | ----------------------------------------------------------------- |
| `transactions`    | created            | Run Celery `categorise_transaction` task if `category_id` is null |
| `transactions`    | created or updated | Re-evaluate `nudges` in background                                |
| `budget_months`   | any                | Invalidate budget cache for that user                             |
| `recurring_rules` | created            | Schedule next occurrence                                          |

After processing the push, emit a WebSocket event to the user (see Section 4).

---

## 4. `WebSocket /ws/events`

### 4.1 Purpose

After any async Celery job completes, the server pushes an `invalidate` event to the user's
active WebSocket connection. The mobile app receives this and immediately invalidates the
relevant React Query caches, giving real-time UI updates without polling.

### 4.2 Connection

```
WS /ws/events?token=<jwt_access_token>
```

Authentication is via query param (not header) because the browser/native WebSocket API
does not support custom headers on the upgrade handshake.

### 4.3 FastAPI implementation

```python
# routers/ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from app.auth import verify_token
from app.ws_manager import ConnectionManager

router = APIRouter()
manager = ConnectionManager()

@router.websocket("/ws/events")
async def events_ws(websocket: WebSocket, token: str = Query(...)):
    user = await verify_token(token)
    if not user:
        await websocket.close(code=4001)  # 4001 = unauthorized
        return

    await manager.connect(user.id, websocket)
    try:
        while True:
            # Keep connection alive; client sends periodic pings as plain text
            data = await websocket.receive_text()
            # Optionally echo back a pong:
            # if data == "ping":
            #     await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
```

```python
# app/ws_manager.py
from fastapi import WebSocket
from collections import defaultdict
import asyncio, json

class ConnectionManager:
    def __init__(self):
        # One user can have multiple connections (phone + tablet + web)
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[user_id].append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)

    async def send_to_user(self, user_id: str, event: dict):
        """Send an event to all active connections for a user."""
        dead = []
        for ws in self._connections.get(user_id, []):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

# Global singleton — import this wherever you need to emit events
manager = ConnectionManager()
```

### 4.4 Event schema

All events follow this shape:

```json
{ "type": "invalidate", "keys": ["accounts", "transactions", "nudges"] }
```

**Valid keys** (these are the React Query cache keys the mobile app knows about):

| Key              | Meaning                                  |
| ---------------- | ---------------------------------------- |
| `"accounts"`     | User's linked bank accounts and balances |
| `"transactions"` | Transaction list and detail              |
| `"nudges"`       | AI nudges/insights                       |
| `"budget"`       | Budget month allocations                 |
| `"categories"`   | Category groups and categories           |
| `"bills"`        | Recurring bills                          |

### 4.5 Where to emit events from Celery tasks

```python
# tasks/categorise.py
from app.ws_manager import manager
import asyncio

@celery.task
def categorise_transaction(transaction_id: str, user_id: str):
    # ... categorisation logic ...

    # Notify the user's device
    asyncio.run(manager.send_to_user(user_id, {
        "type": "invalidate",
        "keys": ["transactions", "nudges"]
    }))
```

```python
# tasks/sync_account.py
@celery.task
def sync_mono_account(account_id: str, user_id: str):
    # ... fetch from Mono API, write transactions to DB ...

    asyncio.run(manager.send_to_user(user_id, {
        "type": "invalidate",
        "keys": ["accounts", "transactions", "nudges"]
    }))
```

```python
# Inside POST /sync/push handler, after processing changes:
await manager.send_to_user(current_user.id, {
    "type": "invalidate",
    "keys": ["budget", "transactions"]
})
```

> **Note on asyncio + Celery:** Celery workers run in a synchronous context. Use
> `asyncio.run(...)` to dispatch the async send, or maintain a Redis pub/sub channel
> that a dedicated async FastAPI background task monitors and forwards to WebSocket clients.
> The Redis approach is more robust for multi-worker deployments.

### 4.6 Redis-backed pub/sub (recommended for production)

For multi-worker deployments, use Redis as the message bus between Celery workers
(sync context) and the FastAPI WebSocket server (async context):

```python
# Celery task: publish to Redis
import redis, json
r = redis.Redis.from_url(settings.REDIS_URL)

def notify_user(user_id: str, keys: list[str]):
    r.publish(f"user:{user_id}:events", json.dumps({
        "type": "invalidate",
        "keys": keys
    }))

# FastAPI: subscribe and forward to WebSocket
@router.websocket("/ws/events")
async def events_ws(websocket: WebSocket, token: str = Query(...)):
    user = await verify_token(token)
    await websocket.accept()

    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"user:{user.id}:events")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        await pubsub.unsubscribe()
```

---

## 5. Mobile client behaviour (for reference)

The mobile app (`hooks/useJobEvents.ts`) connects to `/ws/events` on startup when authenticated,
and reconnects with exponential backoff (1s, 2s, 4s… up to 30s, max 5 retries) on disconnect.

When an `invalidate` event arrives, it calls `queryClient.invalidateQueries({ queryKey: [key] })`
for each key in the `keys` array. This triggers background refetches for any mounted components
that use those queries.

On receiving a push error (`HTTP 4xx/5xx` from `/sync/push`), the mobile app surfaces a toast
and does not retry automatically — the user must pull-to-refresh.

---

## 6. Summary checklist

- [ ] `GET /sync/pull?last_pulled_at=<ms>` — returns `{ changes, timestamp }` for all 6 tables
- [ ] `POST /sync/push` — accepts `{ changes, last_pulled_at }`, upserts records, validates ownership
- [ ] Post-push: trigger Celery `categorise_transaction` for uncategorised transactions
- [ ] Post-push: emit WebSocket `invalidate` event to the user
- [ ] `WS /ws/events?token=<jwt>` — authenticates, maintains connection, accepts pings
- [ ] Celery tasks emit `invalidate` events on job completion
- [ ] `ConnectionManager` handles multiple connections per user (multi-device)
- [ ] Redis pub/sub bridge for multi-worker deployments
