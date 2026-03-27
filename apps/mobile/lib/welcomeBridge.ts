// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * welcomeBridge — decouples AppWelcome dismissal from the home screen tour.
 *
 * Flow:
 *  1. AppWelcome calls releaseWelcome() when it closes (finish or skip).
 *  2. If AppWelcome was never shown (returning user), the home screen calls
 *     releaseWelcome() directly from useFocusEffect.
 *  3. The home screen tour registers via onWelcomeDone(callback) — callback
 *     fires immediately if AppWelcome has already been dismissed, otherwise
 *     it queues until releaseWelcome() is called.
 *
 * State resets when a new userId is seen so every fresh login gets a clean
 * slate.
 */

type Callback = () => void;

let _cb: Callback | null = null;
let _released = false;
let _currentUserId = '';

/** Reset bridge state for a new user login. */
export function resetWelcomeBridgeForUser(userId: string): void {
  if (userId === _currentUserId) return;
  _currentUserId = userId;
  _cb = null;
  _released = false;
}

/** Called by the home screen tour to register its start callback.
 *  Fires immediately if AppWelcome has already been dismissed. */
export function onWelcomeDone(cb: Callback): void {
  if (_released) {
    cb();
  } else {
    _cb = cb;
  }
}

/** Called by AppWelcome on dismiss (and by the home screen when AppWelcome
 *  was not shown for a returning user). Safe to call multiple times. */
export function releaseWelcome(): void {
  if (_released) return;
  _released = true;
  if (_cb) {
    _cb();
    _cb = null;
  }
}
