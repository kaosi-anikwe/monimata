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
    # Every day at 3:00 AM WAT — re-sync stale accounts
    "nightly-reconciliation": {
        "task": "app.worker.tasks.nightly_reconciliation",
        "schedule": crontab(hour=3, minute=0),
    },
    # Every day at 4:00 AM WAT — recompute budget activity from transactions
    "reconcile-budget-activity": {
        "task": "app.worker.tasks.reconcile_budget_activity",
        "schedule": crontab(hour=4, minute=0),
    },
    # Every day at 7:05 AM WAT — deliver queued nudges
    "deliver-queued-nudges": {
        "task": "app.worker.tasks.deliver_queued_nudges",
        "schedule": crontab(hour=7, minute=5),
    },
    # Every Friday at 5:00 PM WAT — weekly review nudges
    "weekly-review-nudges": {
        "task": "app.worker.tasks.weekly_review_nudges",
        "schedule": crontab(hour=17, minute=0, day_of_week="friday"),
    },
}
