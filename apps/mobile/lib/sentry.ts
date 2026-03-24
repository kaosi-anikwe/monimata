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
 * lib/sentry.ts
 *
 * Sentry initialisation for production crash reporting.
 *
 * --- SETUP ---
 * 1. Set EXPO_PUBLIC_SENTRY_DSN in your .env file (see .env.example).
 * 2. For full native crash reporting (JNI crashes, OOM, ANRs), run once:
 *      npx @sentry/wizard@latest -i reactNative
 *    This configures Android ProGuard rules and iOS dSYM upload.
 *    Without the wizard, only JS-layer exceptions are captured.
 *
 * --- USAGE ---
 * Sentry is initialised by calling `initSentry()` at app startup (app/_layout.tsx).
 * The `Sentry.wrap(Component)` HOC is applied to the root navigator.
 * ErrorBoundary calls `Sentry.captureException(error)` on uncaught component errors.
 *
 * To capture errors manually from anywhere in the app:
 *   import * as Sentry from '@sentry/react-native';
 *   Sentry.captureException(new Error('something failed'));
 *   Sentry.captureMessage('informational message', 'info');
 *
 * To attach user context (call after login):
 *   Sentry.setUser({ id: user.id, email: user.email });
 *
 * To clear user context (call on logout):
 *   Sentry.setUser(null);
 */

import * as Sentry from '@sentry/react-native';

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    // DSN is optional — Sentry is a no-op in dev/CI builds without it.
    if (__DEV__) {
      console.info('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set — crash reporting disabled.');
    }
    return;
  }

  Sentry.init({
    dsn,
    // Send default PII (IP address, user context) to aid debugging.
    sendDefaultPii: true,
    // Send performance traces for 10% of sessions in production to avoid overhead.
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    // Attach environment tag so you can filter Sentry issues by build type.
    environment: __DEV__ ? 'development' : 'production',
    // Include the app version in every event — makes regressions easy to spot.
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0',
    // Enable Sentry structured logs (appears in the Logs tab in the Sentry dashboard).
    enableLogs: true,
    // Session Replay: record 10% of normal sessions, 100% of sessions that hit an error.
    replaysSessionSampleRate: __DEV__ ? 0 : 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [
      // Records screen video-like replays for debugging (mobile).
      Sentry.mobileReplayIntegration(),
      // Adds an in-app feedback button so users can report issues with a screenshot.
      Sentry.feedbackIntegration(),
    ],
    // Ignore predictable non-bugs that would create noise.
    ignoreErrors: [
      'Network request failed',
      'AbortError',
    ],
    beforeSend(event) {
      // Strip PII from event breadcrumbs before they leave the device.
      // (Full request URL may contain access tokens in query params.)
      // Use an 'any' cast because the Sentry SDK changed the breadcrumbs
      // type across versions; the underlying shape { values: Breadcrumb[] }
      // is stable at runtime.
      const crumbs: unknown[] | undefined = (event.breadcrumbs as any)?.values;
      if (Array.isArray(crumbs)) {
        (event.breadcrumbs as any).values = crumbs.map((bc: any) => ({
          ...bc,
          data: bc.data ? { ...bc.data, url: bc.data.url?.split('?')[0] } : bc.data,
        }));
      }
      return event;
    },
  });
}

export { Sentry };

