#!/bin/bash
# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# API entrypoint: runs Alembic migrations then starts uvicorn.
# Used as the default CMD in the Dockerfile.
# The Celery worker+beat service overrides CMD directly — it does NOT use this script.

set -e

echo "==> Running database migrations…"
alembic upgrade head

echo "==> Starting API server…"
# 1 worker keeps RAM usage low on a constrained VPS.
# Increase to 2–3 if you have headroom (formula: 2 × CPU + 1).
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 2 \
    --log-level info
