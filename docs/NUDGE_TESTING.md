# Nudge Engine — Testing Strategy

This document covers **both functional and integration testing** for MoniMata's nudge
engine, from backend unit tests through to end-to-end push delivery on a device.

---

## 1. Local Backend — smoke-test without a device

### 1.1 Apply the migration first

```bash
cd apps/api
alembic upgrade head
```

Verify the new columns exist:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('nudges', 'users')
  AND column_name IN ('title', 'context', 'fcm_token');
```

### 1.2 Use the test-trigger endpoint

`POST /nudges/test-trigger` bypasses fatigue limits and dedup, so you can fire any
nudge type on demand:

```bash
# Threshold-80 nudge
curl -X POST http://localhost:8000/nudges/test-trigger \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"trigger_type": "threshold_80"}'

# All five types: threshold_80 | threshold_100 | large_single_tx | pay_received | bill_payment
```

The endpoint returns the created `Nudge` object (with `context` populated) so you can
inspect it without touching the mobile app.

### 1.3 Evaluate full nudge context for one transaction

Create a manual transaction via the transactions API, then manually trigger
`categorize_transactions` (or wait for Celery to pick it up):

```bash
# 1. Create a manual debit large enough to exceed 80 % of a budget category
curl -X POST http://localhost:8000/transactions/manual \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": -4500000,
    "narration": "Supermarket run",
    "category_id": "<FOOD_CATEGORY_ID>"
  }'

# 2. Poll nudges — the worker will create one after categorization
curl http://localhost:8000/nudges \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 2. Celery worker — task inspection

Run [Flower](https://flower.readthedocs.io/en/latest/) to observe tasks in real time:

```bash
cd apps/api
celery -A app.worker.celery_app flower --port=5555
```

Visit `http://localhost:5555`.

Key tasks to monitor:

| Task                      | Trigger                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `categorize_transactions` | After a transaction is created / synced                                   |
| `deliver_queued_nudges`   | Beat schedule, every 5 minutes; delivers nudges queued during quiet hours |
| `fetch_transactions`      | Manual sync or Mono webhook                                               |

To force `deliver_queued_nudges` immediately:

```bash
celery -A app.worker.celery_app call app.worker.tasks.deliver_queued_nudges
```

---

## 3. Push notifications on-device (Expo Go / dev build)

### 3.1 Run the app and grant permissions

```bash
cd apps/mobile
npx expo start
```

Open Expo Go. On the first launch:

1. The OS will ask for notification permission — grant it.
2. The app calls `GET /nudges/register-device` with the `ExponentPushToken[...]` token.
3. Verify the token is stored: `SELECT fcm_token FROM users WHERE id = '<user id>';`

### 3.2 Send a test push

Use the [Expo Push Notification Tool](https://expo.dev/notifications):

```
To: ExponentPushToken[xxxxxx]
Title: Budget Warning 🟡
Body: You've used 82% of your Food budget this month.
```

Or via cURL:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxx]",
    "title": "Budget Warning",
    "body": "You have used 82% of your Food budget."
  }'
```

### 3.3 Trigger a real nudge end-to-end

1. Open the app — you should be on the Budget tab.
2. Record a large transaction (≥ 40 % of a category budget) via the FAB.
3. The Celery worker runs `categorize_transactions` → `evaluate_transaction_nudges`.
4. If the app is in the foreground: an `Alert` dialog appears with "View" / "Dismiss".
5. If the app is backgrounded: the OS notification banner appears; tapping it navigates to the Nudges tab.
6. The Nudges tab badge increments; the card appears in the list.

---

## 4. Nudge detail view — test all context shapes

Use `POST /nudges/test-trigger` with each `trigger_type`, then open the nudge in the
app to confirm the "Why you got this" section renders correctly for every type:

| `trigger_type`    | Expected "Why" text                                       | Expected action buttons            |
| ----------------- | --------------------------------------------------------- | ---------------------------------- |
| `threshold_80`    | "You've used X% of your Y budget..."                      | Adjust budget, Review transactions |
| `threshold_100`   | "Your Y budget ... is fully used. You overspent by ₦Z..." | Adjust budget, Review transactions |
| `large_single_tx` | "A single transaction of ₦X ... consumed Y% of..."        | Review transactions, Adjust budget |
| `pay_received`    | "₦X credit was received..."                               | Assign to your budget              |
| `bill_payment`    | "Your Biller payment of ₦X was processed..."              | View bill history                  |

---

## 5. Quiet-hours and fatigue logic

### 5.1 Quiet-hours queue

1. Temporarily change your user's `nudge_settings` to set quiet hours that include the current time:

```bash
curl -X PATCH http://localhost:8000/nudges/settings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"quiet_hours_start": "00:00", "quiet_hours_end": "23:59"}'
```

2. Trigger any nudge (e.g. `POST /nudges/test-trigger`).
3. Verify `delivered_at IS NULL` in the database:

```sql
SELECT id, title, delivered_at FROM nudges WHERE delivered_at IS NULL ORDER BY created_at DESC LIMIT 5;
```

4. Run `deliver_queued_nudges` manually (see §2 above) — `delivered_at` should be set and the push sent.

5. Restore your settings:

```bash
curl -X PATCH http://localhost:8000/nudges/settings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"quiet_hours_start": "23:00", "quiet_hours_end": "07:00"}'
```

### 5.2 Fatigue limit (3 nudges/day)

Create 3 nudges via `test-trigger`, then attempt a 4th:

```bash
for i in 1 2 3; do
  curl -s -X POST http://localhost:8000/nudges/test-trigger \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"trigger_type": "pay_received"}' | jq '.id'
done
```

The nudge engine respects the fatigue guard on real triggers (not on test-trigger).
To test the guard on real code, create > 3 manual transactions in one WAT day and
verify only 3 nudges are created.

---

## 6. Mono sync — triggering automatic nudges

Mono's sandbox accounts **do not auto-fire webhooks** on a 24-hour cycle. Use these
workarounds:

| Method                     | How                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Manual sync**            | `POST /accounts/{account_id}/sync` — queues `fetch_transactions` which may create nudges after categorization |
| **Mono webhook simulator** | Mono dashboard → Webhooks → Send Test Event → `account_updated`                                               |
| **Manual transaction API** | `POST /transactions/manual` — fastest path; bypasses Mono entirely                                            |

---

## 7. Acceptance checklist before release

- [ ] `expo-notifications` permission prompt appears on first launch
- [ ] `fcm_token` stored in DB after permission granted
- [ ] Foreground nudge: `Alert` dialog shows title + body with "View" navigating to Nudges tab
- [ ] Background nudge: OS banner navigates to Nudges tab on tap
- [ ] Nudge card renders unread dot; dot disappears after opening
- [ ] "Mark all read" clears all unread dots and removes badge
- [ ] Nudge detail sheet shows correct "Why you got this" for all 5 trigger types
- [ ] All 5 action buttons deep-link to the correct tab
- [ ] Dismiss removes the nudge from the active list (opacity reduction) and closes the sheet
- [ ] Tab bar badge shows unread count; badge disappears when all nudges opened
- [ ] Quiet-hours: nudges queue correctly and deliver after the quiet window ends
- [ ] Fatigue: > 3 real nudge attempts in one day → no additional push sent
- [ ] `alembic upgrade head` applies migration 0006 without errors on a clean DB
