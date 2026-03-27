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
 * useTour — convenience hook for screens to trigger their tour on first visit.
 *
 * Usage in a screen component:
 *
 *   const startTourIfUnseen = useTour();
 *
 *   useFocusEffect(useCallback(() => {
 *     startTourIfUnseen('budget', BUDGET_TOUR_STEPS);
 *   }, []));
 *
 * The tour is shown at most once per account per device. The seen state is
 * keyed by userId + tourId and stored in SecureStore so it persists across
 * app restarts. When a different account logs in on the same device they will
 * see the tour fresh.
 *
 * The function is safe to call on every screen focus — it checks the store
 * first and is a no-op after the first time.
 */

import { useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

import { useAppSelector } from '@/store/hooks';
import { useTourContext, type TourStep } from './TourProvider';

const STORE_PREFIX = 'tourSeen_v1_';
const DEFERRED_PREFIX = 'tourDeferred_v1_';

export function useTour() {
  const { startTour, queueDeferred } = useTourContext();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');

  const startTourIfUnseen = useCallback(
    async (tourId: string, steps: TourStep[], onDone?: () => void) => {
      // No user logged in yet — skip silently.
      if (!userId) { onDone?.(); return; }

      const seenKey = `${STORE_PREFIX}${userId}_${tourId}`;
      const deferredKey = `${DEFERRED_PREFIX}${userId}_${tourId}`;

      // ── Deferred steps from a previous visit ─────────────────────────────
      // Check independently of the "seen" flag — a user may have already
      // completed the main tour but have deferred steps waiting for retry.
      try {
        const deferredRaw = await SecureStore.getItemAsync(deferredKey);
        if (deferredRaw) {
          // Consume immediately so it only fires once per visit.
          await SecureStore.deleteItemAsync(deferredKey);
          const deferredSteps: TourStep[] = JSON.parse(deferredRaw);
          queueDeferred(deferredSteps);
        }
      } catch { /* non-fatal */ }

      // ── Main tour (first visit only) ──────────────────────────────────────
      try {
        const seen = await SecureStore.getItemAsync(seenKey);
        if (seen) {
          // Tour already completed — invoke the callback immediately so the
          // caller can treat this as "tour done" on every subsequent visit.
          onDone?.();
          return;
        }
        // Mark as seen before starting so a crash mid-tour doesn't re-show it
        // on the next launch.
        await SecureStore.setItemAsync(seenKey, '1');
        // Defer to the next frame so the screen's layout pass has committed
        // before the tour overlay appears. TourTarget also uses rAF for
        // measurement, so the two stay in sync.
        requestAnimationFrame(() => startTour(steps, (deferredSteps) => {
          if (deferredSteps.length > 0) {
            // Persist so the next focus can queue them for deferred retry.
            SecureStore.setItemAsync(deferredKey, JSON.stringify(deferredSteps))
              .catch(() => { });
          }
          onDone?.();
        }));
      } catch {
        // SecureStore failure is non-fatal — skip the tour and unblock the UI.
        onDone?.();
      }
    },
    [startTour, queueDeferred, userId],
  );

  return startTourIfUnseen;
}
