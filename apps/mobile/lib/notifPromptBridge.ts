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
 * notifPromptBridge — decouples the notification pre-prompt timing from
 * usePushNotifications (which lives in _layout.tsx) and the home screen
 * tour (which decides *when* to show it).
 *
 * Flow:
 *  1. usePushNotifications determines it *wants* to show the pre-prompt and
 *     calls registerPromptSetter(fn) — registers the show function but does
 *     NOT show it yet.
 *  2. The home screen tour finishes (complete or skip) and calls
 *     releasePrompt() — this fires fn() immediately if already registered,
 *     or queues it for when registerPromptSetter is called next.
 *
 * releasePrompt is guarded so it only fires once per JS session even if
 * called multiple times (e.g. home screen focus on every return visit).
 */

type Trigger = () => void;

let _setter: Trigger | null = null;
let _pending = false;
let _released = false;
let _currentUserId = '';

/** Called by usePushNotifications when the authenticated user changes.
 *  Resets bridge state so a fresh login always gets a clean decision. */
export function resetBridgeForUser(userId: string): void {
  if (userId === _currentUserId) return; // same user, no reset needed
  _currentUserId = userId;
  _setter = null;
  _pending = false;
  _released = false;
}

/** Called by usePushNotifications when it has determined it should show the
 *  pre-prompt. Fires immediately if the tour has already completed. */
export function registerPromptSetter(fn: Trigger): void {
  _setter = fn;
  if (_pending) {
    _pending = false;
    fn();
  }
}

/** Called by the home screen tour's onDone callback. Shows the pre-prompt
 *  if usePushNotifications is ready, otherwise queues it.
 *  Safe to call multiple times — only fires once per JS session. */
export function releasePrompt(): void {
  if (_released) return;
  _released = true;
  if (_setter) {
    _setter();
  } else {
    _pending = true;
  }
}
