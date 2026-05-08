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

# Install only the OS packages required at runtime.
# psycopg2-binary bundles libpq, so no libpq-dev needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        # alembic uses subprocess calls that may need bash
        bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first so Docker can cache this layer.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

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
