# MoniMata — Deployment Guide

**Covers:** Ubuntu server setup · Development/debugging workflow · Production architecture recommendation

---

## Table of Contents

1. [Process Overview](#1-process-overview)
2. [Server Preparation](#2-server-preparation)
3. [Application Setup](#3-application-setup)
4. [Environment Configuration](#4-environment-configuration)
5. [Database Setup](#5-database-setup)
6. [Running in Development / Debug Mode](#6-running-in-development--debug-mode)
7. [Running in Production with systemd](#7-running-in-production-with-systemd)
8. [Nginx Reverse Proxy](#8-nginx-reverse-proxy)
9. [TLS/HTTPS with Certbot](#9-tlshttps-with-certbot)
10. [Log Management](#10-log-management)
11. [Deployments and Updates](#11-deployments-and-updates)
12. [Production Architecture Recommendation](#12-production-architecture-recommendation)

---

## 1. Process Overview

The backend consists of **four long-running processes** that must all be running for the app to work:

| Process           | What it does                                                                        | Command                                  |
| ----------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| **uvicorn**       | FastAPI HTTP server — handles all API requests                                      | `uvicorn app.main:app`                   |
| **celery worker** | Executes background tasks (bank sync, categorisation, nudge generation)             | `celery -A app.worker.celery_app worker` |
| **celery beat**   | Scheduler — triggers periodic tasks (nightly reconciliation, queued nudge delivery) | `celery -A app.worker.celery_app beat`   |
| **Redis**         | Message broker for Celery + result backend                                          | system service                           |

**PostgreSQL** is also required but runs as a system service, not an application-managed process.

---

## 2. Server Preparation

### 2.1 Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Install system dependencies

```bash
sudo apt install -y \
  python3.11 python3.11-venv python3.11-dev \
  postgresql postgresql-contrib \
  redis-server \
  nginx \
  certbot python3-certbot-nginx \
  git \
  build-essential \
  libpq-dev \
  curl \
  ufw
```

### 2.3 Create a dedicated system user

Never run the application as root.

```bash
sudo useradd --system --create-home --shell /bin/bash monimata
```

### 2.4 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## 3. Application Setup

### 3.1 Clone the repository

```bash
sudo mkdir -p /srv/monimata
sudo chown monimata:monimata /srv/monimata
sudo -u monimata git clone <your-repo-url> /srv/monimata/app
```

### 3.2 Create the Python virtual environment

```bash
sudo -u monimata python3.11 -m venv /srv/monimata/venv
```

### 3.3 Install Python dependencies

```bash
sudo -u monimata /srv/monimata/venv/bin/pip install --upgrade pip
sudo -u monimata /srv/monimata/venv/bin/pip install -r /srv/monimata/app/apps/api/requirements.txt
```

### 3.4 Convenience: add venv to the monimata user's PATH

```bash
sudo -u monimata bash -c 'echo "export PATH=/srv/monimata/venv/bin:\$PATH" >> ~/.bashrc'
```

---

## 4. Environment Configuration

### 4.1 Create the .env file

```bash
sudo -u monimata cp /srv/monimata/app/apps/api/.env.example /srv/monimata/app/apps/api/.env
sudo -u monimata nano /srv/monimata/app/apps/api/.env
```

Fill in every value. Critical fields:

```bash
# Database — use the production DB user (not postgres superuser)
DATABASE_URL=postgresql://monimata_user:STRONG_PASSWORD@localhost:5432/monimata

# Redis
REDIS_URL=redis://localhost:6379/0

# CORS — set to your actual API domain
CORS_ORIGINS=["https://api.yourdomain.com"]

# JWT RS256 keys (see below)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# AES key for PII encryption
AES_ENCRYPTION_KEY=<64-char hex string>

# Mono + Interswitch production credentials
MONO_SECRET_KEY=...
MONO_WEBHOOK_SECRET=...
INTERSWITCH_CLIENT_ID=...
INTERSWITCH_CLIENT_SECRET=...
INTERSWITCH_ENV=production
INTERSWITCH_QUICKTELLER_URL=https://api.interswitchng.com/quickteller/api/v5

# Logging
LOG_LEVEL=INFO
LOG_DIR=/srv/monimata/logs/api
```

### 4.2 Generate RS256 JWT keys

```bash
# Run on the server as the monimata user
openssl genrsa -out /srv/monimata/private.pem 2048
openssl rsa -in /srv/monimata/private.pem -pubout -out /srv/monimata/public.pem
chmod 600 /srv/monimata/private.pem

# View the keys to copy into .env (escape newlines as \n)
cat /srv/monimata/private.pem
cat /srv/monimata/public.pem
```

When pasting PEM keys into `.env`, replace literal newlines with `\n`:

```bash
# Helper: print key with \n on one line
awk 'NF {ORS="\\n"; print}' /srv/monimata/private.pem
```

### 4.3 Generate the AES encryption key

```bash
/srv/monimata/venv/bin/python -c "import secrets; print(secrets.token_hex(32))"
```

### 4.4 Lock down the .env file

```bash
sudo chmod 600 /srv/monimata/app/apps/api/.env
sudo chown monimata:monimata /srv/monimata/app/apps/api/.env
```

---

## 5. Database Setup

### 5.1 Create the PostgreSQL database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER monimata_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE monimata OWNER monimata_user;
GRANT ALL PRIVILEGES ON DATABASE monimata TO monimata_user;
SQL
```

### 5.2 Run migrations

```bash
cd /srv/monimata/app/apps/api
sudo -u monimata /srv/monimata/venv/bin/alembic upgrade head
```

### 5.3 Verify

```bash
sudo -u postgres psql -d monimata -c "\dt"
```

---

## 6. Running in Development / Debug Mode

During active development, you want processes you can **stop, restart, and watch in real time** without touching systemd. Use **tmux** to keep multiple terminal panes alive in a single SSH session — panes survive disconnects.

### 6.1 Install tmux

```bash
sudo apt install -y tmux
```

### 6.2 Create a reusable tmux session layout

Create a helper script at `/srv/monimata/dev-start.sh`:

```bash
sudo -u monimata tee /srv/monimata/dev-start.sh <<'EOF'
#!/bin/bash
# Starts all MoniMata processes in a named tmux session.
# Usage: bash /srv/monimata/dev-start.sh
# Attach: tmux attach -t monimata
# Kill all: tmux kill-session -t monimata

SESSION="monimata"
VENV="/srv/monimata/venv/bin"
APP_DIR="/srv/monimata/app/apps/api"

# Kill any existing session
tmux kill-session -t "$SESSION" 2>/dev/null

# Create session with 4 windows
tmux new-session  -d -s "$SESSION" -n "uvicorn"  -x 220 -y 50
tmux new-window       -t "$SESSION"              -n "worker"
tmux new-window       -t "$SESSION"              -n "beat"
tmux new-window       -t "$SESSION"              -n "shell"

# Window 0 — uvicorn (--reload for hot reload on code change)
tmux send-keys -t "$SESSION:uvicorn" \
  "cd $APP_DIR && $VENV/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug" \
  Enter

# Window 1 — celery worker (-l DEBUG for verbose task logging)
tmux send-keys -t "$SESSION:worker" \
  "cd $APP_DIR && $VENV/celery -A app.worker.celery_app worker --loglevel=debug --concurrency=2" \
  Enter

# Window 2 — celery beat
tmux send-keys -t "$SESSION:beat" \
  "cd $APP_DIR && $VENV/celery -A app.worker.celery_app beat --loglevel=debug" \
  Enter

# Window 3 — interactive shell (for ad-hoc commands, migrations, etc.)
tmux send-keys -t "$SESSION:shell" \
  "cd $APP_DIR && source /srv/monimata/venv/bin/activate" \
  Enter

echo ""
echo "✓ MoniMata processes started."
echo ""
echo "  Attach:           tmux attach -t monimata"
echo "  Switch windows:   Ctrl-b, then 0/1/2/3  (or Ctrl-b n / Ctrl-b p)"
echo "  Detach:           Ctrl-b d"
echo "  Kill everything:  tmux kill-session -t monimata"
echo ""
EOF
sudo chmod +x /srv/monimata/dev-start.sh
sudo chown monimata:monimata /srv/monimata/dev-start.sh
```

### 6.3 Start development mode

```bash
sudo -u monimata bash /srv/monimata/dev-start.sh
sudo -u monimata tmux attach -t monimata
```

### 6.4 tmux quick reference

| Action                        | Keys                                    |
| ----------------------------- | --------------------------------------- |
| Detach (leave running)        | `Ctrl-b d`                              |
| Switch to window by number    | `Ctrl-b 0` / `1` / `2` / `3`            |
| Next / previous window        | `Ctrl-b n` / `Ctrl-b p`                 |
| Scroll up in pane             | `Ctrl-b [` then arrow keys; `q` to exit |
| Kill current window           | `Ctrl-b &`                              |
| List sessions                 | `tmux ls`                               |
| Re-attach after SSH reconnect | `tmux attach -t monimata`               |

### 6.5 Restart a single process

Detach is non-destructive — the processes keep running. To **restart just uvicorn** (e.g. after changing a config file that `--reload` doesn't pick up):

```bash
# From inside the tmux session, switch to the uvicorn window
# Ctrl-b 0
# Then Ctrl-c to stop, then Up arrow + Enter to re-run
```

Or from outside tmux:

```bash
# Send Ctrl-c then restart to the uvicorn window without attaching
tmux send-keys -t monimata:uvicorn C-c Enter
sleep 1
tmux send-keys -t monimata:uvicorn \
  "cd /srv/monimata/app/apps/api && /srv/monimata/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug" \
  Enter
```

### 6.6 Run a migration during development

```bash
# In the shell window (window 3) or any SSH session:
cd /srv/monimata/app/apps/api
source /srv/monimata/venv/bin/activate
alembic upgrade head
```

### 6.7 Trigger a Celery task manually for testing

```bash
# In the shell window:
cd /srv/monimata/app/apps/api
source /srv/monimata/venv/bin/activate
python - <<'PY'
from app.worker.tasks import nightly_reconciliation
result = nightly_reconciliation.delay()
print("Task ID:", result.id)
PY
```

### 6.8 Check the live API logs while debugging

```bash
# From outside the session — tail the file log
tail -f /srv/monimata/logs/api/*.log

# Or tail the structlog JSON logs and pipe through jq for readability:
tail -f /srv/monimata/logs/api/*.log | jq '.'
```

---

## 7. Running in Production with systemd

When you're ready for stable production operation, move away from tmux and use **systemd** so that:

- Processes start automatically on boot
- Crashes are automatically restarted
- Logs integrate with `journald`
- A single `systemctl` command starts/stops/restarts each service

### 7.1 Create a systemd environment file

systemd units should not source `.env` files directly. Use `EnvironmentFile`:

```bash
sudo cp /srv/monimata/app/apps/api/.env /etc/monimata.env
sudo chmod 600 /etc/monimata.env
sudo chown root:monimata /etc/monimata.env
```

### 7.2 uvicorn — `monimata-api.service`

```bash
sudo tee /etc/systemd/system/monimata-api.service <<'EOF'
[Unit]
Description=MoniMata FastAPI (uvicorn)
After=network.target postgresql.service redis.service
Requires=postgresql.service redis.service

[Service]
Type=simple
User=monimata
Group=monimata
WorkingDirectory=/srv/monimata/app/apps/api
EnvironmentFile=/etc/monimata.env

ExecStart=/srv/monimata/venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 4 \
    --log-level info

Restart=on-failure
RestartSec=5s

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/monimata/logs

StandardOutput=journal
StandardError=journal
SyslogIdentifier=monimata-api

[Install]
WantedBy=multi-user.target
EOF
```

> **Workers:** Set `--workers` to `(2 × CPU cores) + 1`. On a 2-core VPS, use `--workers 4` or `--workers 5`.

### 7.3 Celery worker — `monimata-worker.service`

```bash
sudo tee /etc/systemd/system/monimata-worker.service <<'EOF'
[Unit]
Description=MoniMata Celery Worker
After=network.target redis.service postgresql.service
Requires=redis.service postgresql.service

[Service]
Type=forking
User=monimata
Group=monimata
WorkingDirectory=/srv/monimata/app/apps/api
EnvironmentFile=/etc/monimata.env

ExecStart=/srv/monimata/venv/bin/celery \
    -A app.worker.celery_app worker \
    --loglevel=info \
    --concurrency=4 \
    --pidfile=/run/monimata/celery-worker.pid \
    --logfile=/srv/monimata/logs/celery-worker.log \
    --detach

ExecStop=/srv/monimata/venv/bin/celery \
    -A app.worker.celery_app control shutdown

PIDFile=/run/monimata/celery-worker.pid

RuntimeDirectory=monimata
RuntimeDirectoryMode=0755

Restart=on-failure
RestartSec=10s

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/monimata/logs /run/monimata

StandardOutput=journal
StandardError=journal
SyslogIdentifier=monimata-worker

[Install]
WantedBy=multi-user.target
EOF
```

### 7.4 Celery beat — `monimata-beat.service`

```bash
sudo tee /etc/systemd/system/monimata-beat.service <<'EOF'
[Unit]
Description=MoniMata Celery Beat Scheduler
After=network.target redis.service
Requires=redis.service

[Service]
Type=simple
User=monimata
Group=monimata
WorkingDirectory=/srv/monimata/app/apps/api
EnvironmentFile=/etc/monimata.env

ExecStart=/srv/monimata/venv/bin/celery \
    -A app.worker.celery_app beat \
    --loglevel=info \
    --scheduler celery.beat.PersistentScheduler \
    --schedule=/srv/monimata/celerybeat-schedule

Restart=on-failure
RestartSec=10s

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/monimata /srv/monimata/logs

StandardOutput=journal
StandardError=journal
SyslogIdentifier=monimata-beat

[Install]
WantedBy=multi-user.target
EOF
```

> **Important:** Only ever run **one** instance of celery beat. Running multiple beat instances causes duplicate scheduled task executions.

### 7.5 Enable and start all services

```bash
# Create log directory
sudo mkdir -p /srv/monimata/logs
sudo chown -R monimata:monimata /srv/monimata/logs

# Reload systemd, enable on boot, start now
sudo systemctl daemon-reload
sudo systemctl enable monimata-api monimata-worker monimata-beat
sudo systemctl start monimata-api monimata-worker monimata-beat

# Verify all three are running
sudo systemctl status monimata-api
sudo systemctl status monimata-worker
sudo systemctl status monimata-beat
```

### 7.6 Useful systemctl commands

```bash
# Check status
systemctl status monimata-api

# Read logs (live follow)
journalctl -u monimata-api -f

# Read logs (last 100 lines)
journalctl -u monimata-api -n 100 --no-pager

# Restart a service (e.g. after a deploy)
sudo systemctl restart monimata-api

# Restart all three at once
sudo systemctl restart monimata-api monimata-worker monimata-beat

# Stop all
sudo systemctl stop monimata-api monimata-worker monimata-beat
```

---

## 8. Nginx Reverse Proxy

Nginx sits in front of uvicorn, handling TLS termination, request buffering, and serving any static files. Uvicorn should **only** be listening on `127.0.0.1` (not `0.0.0.0`) in production — external traffic goes through Nginx only.

### 8.1 Create the Nginx site config

```bash
sudo tee /etc/nginx/sites-available/monimata-api <<'EOF'
# Rate limiting zone — 10 requests per second per IP
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name api.yourdomain.com;

    # Certbot will add the HTTPS redirect here automatically.
    # Leave this block; certbot modifies it.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.yourdomain.com;

    # TLS — managed by Certbot (paths filled in by certbot --nginx)
    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header X-XSS-Protection          "1; mode=block" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

    # Request size limit (uploads, webhooks)
    client_max_body_size 10M;

    # Proxy to uvicorn
    location / {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Timeouts — increase for Mono syncs which can be slow
        proxy_connect_timeout 10s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    # Health check endpoint — no rate limiting
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
EOF
```

Replace `api.yourdomain.com` with your actual domain throughout.

### 8.2 Enable and test

```bash
sudo ln -s /etc/nginx/sites-available/monimata-api /etc/nginx/sites-enabled/
sudo nginx -t          # must print "syntax is ok" and "test is successful"
sudo systemctl reload nginx
```

---

## 9. TLS/HTTPS with Certbot

```bash
# Obtain and install certificate (--nginx handles config modification automatically)
sudo certbot --nginx -d api.yourdomain.com

# Certbot auto-renewal is installed as a systemd timer. Verify:
sudo systemctl status certbot.timer

# Test renewal without actually renewing (dry run)
sudo certbot renew --dry-run
```

After certbot runs, reload Nginx:

```bash
sudo systemctl reload nginx
```

---

## 10. Log Management

### 10.1 Application logs

The FastAPI app writes structured logs to `LOG_DIR` (set in `.env`). Set it to `/srv/monimata/logs/api` in production.

```bash
sudo mkdir -p /srv/monimata/logs/api /srv/monimata/logs/celery
sudo chown -R monimata:monimata /srv/monimata/logs
```

### 10.2 logrotate — prevent logs from filling the disk

```bash
sudo tee /etc/logrotate.d/monimata <<'EOF'
/srv/monimata/logs/api/*.log
/srv/monimata/logs/celery/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su monimata monimata
}
EOF
```

### 10.3 Reading systemd journal logs

```bash
# Live tail — all three services together
journalctl -u monimata-api -u monimata-worker -u monimata-beat -f

# Errors only
journalctl -u monimata-api -p err -n 50

# Logs from the last hour
journalctl -u monimata-api --since "1 hour ago"
```

---

## 11. Deployments and Updates

A safe update sequence that minimises downtime:

```bash
# 1. Pull the latest code
cd /srv/monimata/app
sudo -u monimata git pull origin main

# 2. Install any new Python dependencies
sudo -u monimata /srv/monimata/venv/bin/pip install -r apps/api/requirements.txt

# 3. Run database migrations
cd apps/api
sudo -u monimata /srv/monimata/venv/bin/alembic upgrade head

# 4. Restart all application processes
sudo systemctl restart monimata-api monimata-worker monimata-beat

# 5. Verify all are healthy
sudo systemctl status monimata-api monimata-worker monimata-beat
curl -sf https://api.yourdomain.com/health && echo "API is up"
```

> **Rollback:** If the new version is broken, `git checkout <previous-tag>`, re-run `alembic downgrade -1` if needed, and restart.

---

## 12. Production Architecture Recommendation

The single-server setup above works for launch and early traction. Below is the recommended progression as you scale.

---

### Phase 1 — Single VPS (current / launch)

```
Internet
    │
    ▼
[ Nginx ]  ← TLS termination, rate limiting
    │
    ├──► [ uvicorn (4 workers) ]  ← FastAPI
    │
    ├──► [ Celery Worker ]
    │
    ├──► [ Celery Beat ]
    │
    ├──► [ PostgreSQL 16 ]  ← on same server
    │
    └──► [ Redis 7 ]        ← on same server
```

**Recommended spec:** 2 vCPU / 4 GB RAM / 40 GB SSD  
**Suitable for:** 0–500 active users  
**Provider options:** DigitalOcean Droplet, Hetzner Cloud CX22, Linode 4GB

**Non-negotiables even at this stage:**

- Automated daily PostgreSQL backups (`pg_dump` → offsite storage, e.g. a DigitalOcean Space or S3-compatible bucket)
- Automated server snapshots (weekly)
- UFW firewall (only ports 22, 80, 443 open to the internet)
- Fail2ban for SSH brute-force protection: `sudo apt install fail2ban`

```bash
# Daily postgres backup — add to monimata user's crontab
sudo -u monimata crontab -e

# Add this line (adjust bucket/path for your storage):
0 2 * * * pg_dump -U monimata_user monimata | gzip > /srv/monimata/backups/monimata_$(date +\%Y\%m\%d).sql.gz
```

---

### Phase 2 — Managed Database + Separated Services (500–2,000 users)

Move PostgreSQL and Redis off the application server. Two main benefits: independent scaling and managed backups/failover.

```
Internet
    │
    ▼
[ Nginx / Load Balancer ]
    │
    ├──► [ App Server 1 ]          ├──► [ Managed PostgreSQL ]
    │     uvicorn + workers              (DigitalOcean Managed DB,
    │                                     Supabase, Neon, or Railway)
    ├──► [ App Server 2 ] (optional)
          uvicorn                  └──► [ Managed Redis ]
                                         (Upstash, Redis Cloud,
                                          or DigitalOcean Managed Redis)
```

**Recommended managed database services:**

| Service                  | PostgreSQL | Redis | Notes                                                                   |
| ------------------------ | ---------- | ----- | ----------------------------------------------------------------------- |
| **DigitalOcean Managed** | ✅         | ✅    | Easiest if already on DigitalOcean; automated backups + failover        |
| **Supabase**             | ✅         | —     | Generous free tier; good for early stage; built-in auth if needed later |
| **Neon**                 | ✅         | —     | Serverless Postgres; scales to zero; good for variable traffic          |
| **Upstash**              | —          | ✅    | Serverless Redis; pay-per-request; ideal for low-volume Celery          |

At this stage, **Celery beat** should move to a dedicated lightweight server or be replaced with a managed scheduler (see Phase 3), since running it on the same server as multiple uvicorn replicas risks double-execution.

---

### Phase 3 — Container-Based (2,000+ users / team scaling)

For a small team continuing active development, Docker Compose → Kubernetes is the logical progression.

#### Docker Compose (staging / small production)

A `docker-compose.prod.yml` with services:

- `api` — uvicorn, built from `apps/api/Dockerfile`
- `worker` — same image, different command (`celery worker`)
- `beat` — same image, command (`celery beat`)
- `postgres` — official `postgres:16` image with a named volume
- `redis` — official `redis:7-alpine`
- `nginx` — or use Traefik as the reverse proxy / TLS provider

Benefits: One command (`docker compose up -d`) to run everything. Easy to test production parity locally.

#### Kubernetes (large scale)

Each service becomes a `Deployment` with `HorizontalPodAutoscaler`:

- `api` deployment: min 2, max 10 replicas
- `worker` deployment: min 1, max 5 replicas
- `beat` deployment: **always exactly 1 replica** (`replicas: 1`, no autoscaling)
- PostgreSQL: RDS (AWS), Cloud SQL (GCP), or Azure Database
- Redis: ElastiCache, Cloud Memorystore, or Azure Cache

**Managed Kubernetes options for a Nigerian startup:**

- **DigitalOcean Kubernetes (DOKS)** — simplest managed K8s, Lagos-adjacent region (AMS3), good price/performance
- **AWS EKS** (Lagos region: `af-south-1`) — enterprise grade; higher ops overhead
- **Google GKE** — strong auto-pilot mode; no Lagos region but `me-west1` (Tel Aviv) is the closest to West Africa with low latency

---

### Monitoring Recommendations

Implement these before going to production, regardless of where you're hosted.

| Category                | Recommended tool                                                                         | Why                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Uptime / alerting**   | [Better Uptime](https://betterstack.com/) or UptimeRobot (free)                          | Pings `/health` endpoint; SMS/email on downtime                                          |
| **Error tracking**      | [Sentry](https://sentry.io) — free tier                                                  | Captures Python exceptions with full stack trace and context; integrate via `sentry-sdk` |
| **Application metrics** | [Prometheus](https://prometheus.io) + [Grafana](https://grafana.com)                     | Track request latency, error rate, Celery queue depth                                    |
| **Log aggregation**     | [Grafana Loki](https://grafana.com/oss/loki/) or [Logtail](https://betterstack.com/logs) | Centralised searchable logs across all services                                          |
| **Database monitoring** | `pg_stat_statements` + pgBadger                                                          | Identify slow queries before they become incidents                                       |

#### Sentry integration (high priority — add before launch)

```bash
/srv/monimata/venv/bin/pip install sentry-sdk[fastapi]
```

Add to `app/main.py` before the FastAPI instantiation:

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.celery import CeleryIntegration

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,  # add SENTRY_DSN to config and .env
    integrations=[FastApiIntegration(), CeleryIntegration()],
    traces_sample_rate=0.1,   # 10% of requests traced for performance
    environment=settings.ENVIRONMENT,  # "development" | "staging" | "production"
)
```

---

### Security Checklist

Before exposing the API to the internet, verify:

- [ ] `.env` is not in version control (check `.gitignore`)
- [ ] `DEBUG=False` / `LOG_LEVEL=INFO` in production
- [ ] RS256 JWT keys are used (not the HS256 fallback `SECRET_KEY`)
- [ ] `AES_ENCRYPTION_KEY` is set and not the example value
- [ ] `Interswitch_ENV=production` when using production credentials
- [ ] PostgreSQL only accepts connections from `localhost` or the app server IP (not `0.0.0.0`)
- [ ] Redis is not exposed to the internet (`bind 127.0.0.1` in `/etc/redis/redis.conf`)
- [ ] UFW allows only ports 22, 80, 443
- [ ] Fail2ban is installed and running
- [ ] TLS certificate auto-renewal is confirmed (`certbot renew --dry-run` passes)
- [ ] Postgres backups are running and the backup files are actually readable
- [ ] Webhook endpoint (`/webhooks/mono`) validates Mono's HMAC-SHA512 signature (already implemented in code)

---

_Questions: contact the engineering team._
