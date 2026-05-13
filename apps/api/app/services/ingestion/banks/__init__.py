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

"""Import every bank package to trigger self-registration.

To add a new bank:
  1. Create ``banks/<slug>/`` with an ``__init__.py`` and an ``email.py``
     (or other channel modules as needed).
  2. Add an import for that package below — that's it.
     The bank's parser module calls ``register_email_parser()`` at import
     time, which adds it to the central registry automatically.
"""

from . import access, firstbank, gtbank, opay, uba, zenith  # noqa: F401
