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
Logging configuration for the MoniMata API.

Log levels (override via LOG_LEVEL env var):
  - DEBUG   — full SQL, all request details
  - INFO    — normal production level (default)
  - WARNING — only warnings and above

Files (relative to LOG_DIR, default ./logs/):
  - app.log        — all messages at LOG_LEVEL and above, rotated at 10 MB, 5 backups
  - error.log      — ERROR and above only, rotated at 10 MB, 5 backups

Console: always enabled, same level as LOG_LEVEL.
"""

from __future__ import annotations

import logging
import logging.config
import os
from pathlib import Path


def configure_logging(log_dir: str = "logs", log_level: str = "INFO") -> None:
    """
    Set up rotating file + console logging.
    Call once at application startup before any loggers are used.
    """
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    level = log_level.upper()

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "detailed": {
                "format": (
                    "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
                ),
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "console": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                "datefmt": "%H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "console",
                "level": level,
            },
            "app_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_path / "app.log"),
                "maxBytes": 10 * 1024 * 1024,  # 10 MB
                "backupCount": 5,
                "encoding": "utf-8",
                "formatter": "detailed",
                "level": level,
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_path / "error.log"),
                "maxBytes": 10 * 1024 * 1024,  # 10 MB
                "backupCount": 5,
                "encoding": "utf-8",
                "formatter": "detailed",
                "level": "ERROR",
            },
        },
        "loggers": {
            # Application loggers — full detail
            "app": {
                "handlers": ["console", "app_file", "error_file"],
                "level": level,
                "propagate": False,
            },
            # Uvicorn — keep access log at INFO, silence debug internals
            "uvicorn": {
                "handlers": ["console", "app_file"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.error": {
                "handlers": ["console", "app_file", "error_file"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["console", "app_file"],
                "level": "INFO",
                "propagate": False,
            },
            # SQLAlchemy — only log SQL when DEBUG is requested
            "sqlalchemy.engine": {
                "handlers": ["app_file"],
                "level": "DEBUG" if level == "DEBUG" else "WARNING",
                "propagate": False,
            },
            # Celery
            "celery": {
                "handlers": ["console", "app_file", "error_file"],
                "level": level,
                "propagate": False,
            },
            # Third-party noise suppression
            "httpx": {
                "handlers": ["app_file"],
                "level": "WARNING",
                "propagate": False,
            },
            "httpcore": {
                "handlers": [],
                "level": "WARNING",
                "propagate": False,
            },
        },
        "root": {
            "handlers": ["console", "app_file", "error_file"],
            "level": level,
        },
    }

    logging.config.dictConfig(config)
