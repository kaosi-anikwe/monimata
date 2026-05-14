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

FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install only the OS packages required at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first so Docker can cache the install layer.
COPY pyproject.toml uv.lock ./

# Install dependencies into the system Python (no virtualenv inside Docker).
# --frozen ensures the lockfile is respected exactly.
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source.
COPY app/       ./app/
COPY alembic/   ./alembic/
COPY alembic.ini .
COPY start.sh   .

RUN chmod +x start.sh \
    && mkdir -p logs

# Coolify routes external HTTPS traffic to this port via its proxy.
EXPOSE 8000

# Default: run DB migrations then start the API.
# Override CMD in the Coolify worker service to run Celery instead.
CMD ["./start.sh"]
