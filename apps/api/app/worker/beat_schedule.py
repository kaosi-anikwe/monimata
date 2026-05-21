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
Celery Beat schedule — defines all periodic tasks.
"""

from celery.schedules import crontab

from app.worker.celery_app import celery_app

celery_app.conf.beat_schedule = {
    # Every 10 minutes, all day.
    # The task checks per-user quiet hours before delivering each nudge, so
    # runs during a user's quiet window are safe no-ops.  Running every 10
    # minutes means delivery happens within 10 minutes of quiet time ending,
    # regardless of what time the window closes.
    "deliver-queued-nudges": {
        "task": "app.worker.tasks.deliver_queued_nudges",
        "schedule": crontab(minute="*/10"),
    },
    # 00:15 WAT daily — roll up previous day's nudge rule metrics.
    "roll-up-nudge-stats": {
        "task": "app.worker.tasks.roll_up_nudge_stats",
        "schedule": crontab(minute=15, hour=23),  # 23:15 UTC = 00:15 WAT
    },
}
