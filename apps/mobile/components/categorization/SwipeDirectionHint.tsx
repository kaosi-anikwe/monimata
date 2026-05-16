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
 * SwipeDirectionHint
 *
 * First-launch gesture guide overlay for the Review Queue (Mode B).
 * Shown once per app session (module-level flag) so it doesn't interfere
 * with returning users.
 *
 * Three arrows explain the swipe directions:
 *   Right → Confirm (top suggestion)
 *   Left  → Later (defer)
 *   Up    → Search (open category search sheet)
 *
 * The overlay fades in immediately, holds for 2.5 s, then fades out.
 * `pointerEvents="none"` ensures it never blocks the gesture layer.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Module-level "shown" flag ────────────────────────────────────────────────
// Persists for the lifetime of the JS bundle — good enough for the spec's
// "show once per session" requirement without needing AsyncStorage.
let swipeHintShownThisSession = false;

// ─── SwipeDirectionHint ───────────────────────────────────────────────────────

export function SwipeDirectionHint() {
  const colors = useTheme();

  // If already shown, start fully transparent.
  const opacity = useSharedValue(swipeHintShownThisSession ? 0 : 1);

  useEffect(() => {
    if (!swipeHintShownThisSession) {
      swipeHintShownThisSession = true;
      // Hold for 2.5 s then fade out over 400 ms.
      opacity.value = withDelay(2500, withTiming(0, { duration: 400 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[ss.overlay, animStyle]}
      pointerEvents="none"
    >
      <View style={[ss.pill, { backgroundColor: colors.darkGreen }]}>
        <HintItem
          icon="arrow-back"
          label="Later"
          color={colors.textMeta}
        />
        <View style={[ss.divider, { backgroundColor: colors.separator }]} />
        <HintItem
          icon="arrow-up"
          label="Search"
          color={colors.lime}
        />
        <View style={[ss.divider, { backgroundColor: colors.separator }]} />
        <HintItem
          icon="arrow-forward"
          label="Confirm"
          color={colors.success}
        />
      </View>
    </Animated.View>
  );
}

// ─── HintItem ─────────────────────────────────────────────────────────────────

interface HintItemProps {
  icon: 'arrow-forward' | 'arrow-back' | 'arrow-up';
  label: string;
  color: string;
}

function HintItem({ icon, label, color }: HintItemProps) {
  return (
    <View style={ss.hintItem}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[type_.caption, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxxl + spacing.xl,
    zIndex: 99,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  hintItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    width: 1,
    height: spacing.xxxl,
  },
});
