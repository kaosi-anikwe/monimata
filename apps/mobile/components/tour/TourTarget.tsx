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
 * TourTarget — wraps any element you want to spotlight during a tour step.
 *
 * Usage:
 *   <TourTarget id="budget-tbb">
 *     <View>…</View>
 *   </TourTarget>
 *
 * When the active tour step's targetId matches this component's `id`, it calls
 * measureInWindow and reports the absolute screen rect to TourContext so the
 * overlay can position the spotlight hole precisely.
 *
 * The component is a transparent pass-through — it adds no visual styling.
 */

import { View } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';

import { useTourContext } from './TourProvider';

interface TourTargetProps {
  id: string;
  children: React.ReactNode;
  /** Extra padding beyond the default PADDING in pixels. Useful for tight elements. */
  extraPadding?: number;
}

export function TourTarget({ id, children }: TourTargetProps) {
  const { activeTargetId, reportRect, notifyTargetMounted, registerTarget, unregisterTarget } = useTourContext();
  const ref = useRef<View>(null);
  // Track whether the native layout pass has run at least once.
  const hasLayoutRef = useRef(false);
  // Mirror of isActive in a ref so onLayout can read it without being recreated.
  const isActiveRef = useRef(false);
  isActiveRef.current = activeTargetId === id;

  const isActive = activeTargetId === id;

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        reportRect({ x, y, width, height });
      }
    });
  }, [reportRect]);

  // onLayout fires after every native layout pass for this view.
  // If this target happens to be active during a layout, re-measure immediately.
  // Also notify the provider when this target mounts while not active, so any
  // queued deferred step for this id can be started.
  const handleLayout = useCallback(() => {
    hasLayoutRef.current = true;
    if (isActiveRef.current) {
      requestAnimationFrame(measure);
    } else {
      notifyTargetMounted(id);
    }
  }, [measure, notifyTargetMounted, id]);

  // Register this target as mounted so queueDeferred can immediately start
  // a deferred step if the SecureStore read arrives after onLayout has already fired.
  useEffect(() => {
    registerTarget(id);
    return () => unregisterTarget(id);
  }, [id, registerTarget, unregisterTarget]);

  useEffect(() => {
    if (!isActive) return;
    if (hasLayoutRef.current) {
      // View is already laid out — one animation frame is enough for the
      // native bridge to have the latest geometry ready.
      const raf = requestAnimationFrame(measure);
      return () => cancelAnimationFrame(raf);
    }
    // No layout yet — handleLayout will trigger the measure once it fires.
  }, [isActive, measure]);

  return (
    <View ref={ref} collapsable={false} onLayout={handleLayout}>
      {children}
    </View>
  );
}
