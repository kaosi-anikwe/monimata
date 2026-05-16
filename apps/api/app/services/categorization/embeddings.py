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

"""Embedding model singleton for the categorisation vector layer (Phase 4).

The SentenceTransformer model is loaded exactly once per worker process via
Celery's worker_process_init signal (see app/worker/celery_app.py).  This
avoids reloading the ~90 MB model on every task invocation.

Usage inside Celery tasks only — never import encode() in the request path.

    from app.services.categorization.embeddings import encode

    vector: list[float] = encode("chicken republic lekki")
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_MODEL_NAME = "all-MiniLM-L6-v2"
_model = None  # set by init_embedding_model()


def init_embedding_model() -> None:
    """Load the SentenceTransformer model into the module-level singleton.

    Called once from the Celery worker_process_init signal handler so the
    model is resident in memory before any task runs.
    """
    global _model
    if _model is not None:
        return
    from sentence_transformers import SentenceTransformer

    logger.info("Loading embedding model %s ...", _MODEL_NAME)
    _model = SentenceTransformer(_MODEL_NAME)
    logger.info("Embedding model loaded.")


def encode(text: str) -> list[float]:
    """Return a 384-dim float vector for the given text.

    Lazily loads the model if not already initialised (e.g. during tests).
    """
    global _model
    if _model is None:
        init_embedding_model()
    assert _model is not None
    vector = _model.encode(text, normalize_embeddings=True)
    return vector.tolist()
