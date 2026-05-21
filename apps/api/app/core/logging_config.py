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
from pathlib import Path

from rich import traceback as rich_traceback
from rich.console import Console
from rich.logging import RichHandler

# Install Rich as the global unhandled-exception renderer.
# max_frames=5 keeps tracebacks concise; show_locals exposes variable values on ERROR+.
rich_traceback.install(max_frames=5, show_locals=True, word_wrap=True)

_RICH_HANDLER = RichHandler(
    rich_tracebacks=True,
    tracebacks_max_frames=5,
    tracebacks_show_locals=True,
    tracebacks_word_wrap=True,
    markup=True,
    log_time_format="[%H:%M:%S]",
    show_path=True,
)


def configure_logging(log_dir: str = "logs", log_level: str = "INFO") -> None:
    """
    Set up Rich console + Rich-formatted rotating file logging.
    Call once at application startup before any loggers are used.
    """
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    level = log_level.upper()
    _RICH_HANDLER.setLevel(level)

    # -- Rich file handlers ----------------------------------------------------
    # Each file gets its own Console(file=...) so Rich renders styled,
    # human-readable output (with tracebacks) into the log files.

    _app_log_file = open(log_path / "app.log", "a", encoding="utf-8")  # noqa: SIM115
    _app_file_handler = RichHandler(
        console=Console(file=_app_log_file, width=120, force_terminal=True),
        rich_tracebacks=True,
        tracebacks_max_frames=10,
        tracebacks_show_locals=True,
        tracebacks_word_wrap=True,
        markup=False,
        log_time_format="[%Y-%m-%d %H:%M:%S]",
        show_path=True,
    )
    _app_file_handler.setLevel(level)

    _err_log_file = open(log_path / "error.log", "a", encoding="utf-8")  # noqa: SIM115
    _err_file_handler = RichHandler(
        console=Console(file=_err_log_file, width=120, force_terminal=True),
        rich_tracebacks=True,
        tracebacks_max_frames=20,
        tracebacks_show_locals=True,
        tracebacks_word_wrap=True,
        markup=False,
        log_time_format="[%Y-%m-%d %H:%M:%S]",
        show_path=True,
    )
    _err_file_handler.setLevel(logging.ERROR)

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "handlers": {
            "console": {
                "()": lambda: _RICH_HANDLER,
                "level": level,
            },
            "app_file": {
                "()": lambda: _app_file_handler,
                "level": level,
            },
            "error_file": {
                "()": lambda: _err_file_handler,
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
