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
Celery application factory.
The broker and result backend both use Redis.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "monimata",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Lagos",
    enable_utc=True,
    task_track_started=True,
    # Retry configuration
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)


# ── Typing helper ─────────────────────────────────────────────────────────────
# Celery's @app.task decorator does not carry enough overload information for
# Pyright to know that the decorated function becomes a Task with .delay().
# Import CeleryTask and use cast(CeleryTask, my_task).delay(...) at call sites.
from typing import Any, Protocol


class CeleryTask(Protocol):
    """Minimal structural type for a Celery Task object with .delay()."""

    def delay(self, *args: Any, **kwargs: Any) -> Any: ...
    def apply_async(self, *args: Any, **kwargs: Any) -> Any: ...
