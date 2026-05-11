# monimata-email-worker

Cloudflare Email Worker that receives forwarded bank-alert emails via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) and forwards the parsed payload to the MoniMata FastAPI backend at `/webhooks/bank-alerts`.

## How it works

```
Bank alert email
      ↓
Cloudflare Email Routing  (rule: forward alerts@moni-mata.ng → this worker)
      ↓
email-worker (postal-mime parses the raw email, Sentry captures errors)
      ↓
POST https://api.moni-mata.ng/webhooks/bank-alerts
      { to, from, subject, body, html }
      Header: X-MoniMata-Secret: <WEBHOOK_SECRET>
      ↓
FastAPI processes the alert
```

## Setup

### 1. Install dependencies

```bash
cd apps/email-worker
npm install
```

### 2. Configure secrets

Production secrets are stored in the Cloudflare dashboard or set via Wrangler:

```bash
wrangler secret put WEBHOOK_SECRET
wrangler secret put SENTRY_DSN
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in values:

```bash
cp .dev.vars.example .dev.vars
```

### 3. Deploy

```bash
npm run deploy
```

### 4. Configure Cloudflare Email Routing

In the Cloudflare dashboard → **Email Routing** for your domain:

1. Add a catch-all or specific rule to route bank alert emails to this worker.
2. Enable the worker as the email routing destination.

## Scripts

| Script               | Description                               |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Local dev server via `wrangler dev`       |
| `npm run deploy`     | Deploy to Cloudflare                      |
| `npm run tail`       | Stream live logs from the deployed worker |
| `npm run type-check` | TypeScript type checking                  |

## Environment variables

| Variable         | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `WEBHOOK_SECRET` | Shared secret; must match `BANK_ALERT_WEBHOOK_SECRET` on the API |
| `SENTRY_DSN`     | Sentry DSN for error monitoring                                  |
