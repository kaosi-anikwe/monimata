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

import sys
from typing import Any, Protocol

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
    # Windows: prefork pool uses Unix semaphores which Windows doesn't support.
    # Use solo (single-threaded) on Windows; prefork is used on Linux/macOS in production.
    worker_pool="solo" if sys.platform == "win32" else "prefork",
    # Route embedding tasks to their own queue so the worker for that queue
    # can be started with --concurrency=1, preventing concurrent PyTorch ops.
    task_routes={
        "app.worker.tasks.embed_category_rule": {"queue": "embeddings"},
    },
)


# ── Worker logging ────────────────────────────────────────────────────────────
# Hook into Celery's setup_logging signal so worker processes write to the
# same logs/app.log + logs/error.log files that uvicorn uses.  Without this,
# all task output goes only to the tmux terminal and is lost on restart.
from celery.signals import setup_logging  # noqa: E402


@setup_logging.connect
def _configure_worker_logging(**kwargs: Any) -> None:
    from app.core.config import settings
    from app.core.logging_config import configure_logging

    configure_logging(log_level=settings.LOG_LEVEL)


# ── Embedding model boot signal ─────────────────────────────────────────────────────────
# Load the SentenceTransformer model once per worker process so it is warm
# before any embed_category_rule task arrives.  This prevents every task from
# paying the ~2-4 s cold-start cost of loading the model from disk.

from celery.signals import worker_process_init  # noqa: E402


@worker_process_init.connect
def _load_embedding_model(**kwargs: Any) -> None:  # type: ignore[misc]
    from app.services.categorization.embeddings import init_embedding_model

    init_embedding_model()


# ── Typing helper ─────────────────────────────────────────────────────────────
# Celery's @app.task decorator does not carry enough overload information for
# Pyright to know that the decorated function becomes a Task with .delay().
# Import CeleryTask and use cast(CeleryTask, my_task).delay(...) at call sites.


class CeleryTask(Protocol):
    """Minimal structural type for a Celery Task object with .delay()."""

    def delay(self, *args: Any, **kwargs: Any) -> Any: ...
    def apply_async(self, *args: Any, **kwargs: Any) -> Any: ...
