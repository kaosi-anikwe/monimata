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
 * BudgetWalkthrough — first-time onboarding overlay for the Budget tab.
 *
 * Slides up as a bottom sheet the first time a user lands on the Budget tab
 * and teaches the four core concepts of zero-based budgeting in plain English.
 *
 * Visibility is persisted in SecureStore so it only ever appears once.
 * Dismissible at any step via the Skip link.
 */

import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ff } from '@/lib/typography';
import { radius, spacing } from '@/lib/tokens';
import { useTheme, type ThemeColors } from '@/lib/theme';

// ── Persistence key ───────────────────────────────────────────────────────────

const WALKTHROUGH_SEEN_KEY = 'budgetWalkthroughSeen_v1';

// ── Step data ─────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Step {
  icon: IoniconName;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: 'wallet-outline',
    title: 'To Be Budgeted (TBB)',
    body: 'Money you\'ve received but haven\'t assigned yet. Your mission: get TBB to ₦0. Give every kobo a job — before you spend it.',
  },
  {
    icon: 'grid-outline',
    title: 'Assign to categories',
    body: 'Tap any category to decide how much goes there this month. Rent, food, transport, savings — everything gets its own budget line.',
  },
  {
    icon: 'stats-chart-outline',
    title: 'Track what\'s left',
    body: 'Green = funded. Red = overspent. The large number per row is your "Available" — what\'s actually left to spend in that category right now.',
  },
  {
    icon: 'add-circle-outline',
    title: 'Log transactions',
    body: 'Bank imports arrive automatically from your linked account. Add cash purchases or manual spends using the + button at the bottom right.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function BudgetWalkthrough() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  // Sheet slides up from below the screen.
  const slideAnim = useRef(new Animated.Value(500)).current;
  // Card content fades + slides when stepping forward.
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SecureStore.getItemAsync(WALKTHROUGH_SEEN_KEY)
      .then((val) => { if (!val) setVisible(true); })
      .catch(() => { /* graceful: if SecureStore fails just don't show */ });
  }, []);

  // Animate sheet in once it becomes visible.
  useEffect(() => {
    if (!visible) return;
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [visible, slideAnim]);

  const dismiss = () => {
    SecureStore.setItemAsync(WALKTHROUGH_SEEN_KEY, '1').catch(() => { });
    Animated.timing(slideAnim, {
      toValue: 700,
      duration: 280,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const goToStep = (next: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Slide-out the current card left, then swap content, then slide in.
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: -24, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      cardTranslate.setValue(24);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(cardTranslate, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      goToStep(step + 1);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dismiss();
    }
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const bottomPad = Math.max(insets.bottom, spacing.lg) + spacing.sm;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={ss.backdrop}>
        <Animated.View
          style={[ss.sheet, { paddingBottom: bottomPad }, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* ── Top row: step count + skip ── */}
          <View style={ss.topRow}>
            <Text style={ss.stepCount}>{step + 1} of {STEPS.length}</Text>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={ss.skipTxt}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* ── Animated step content ── */}
          <Animated.View
            style={[
              ss.content,
              { opacity: cardOpacity, transform: [{ translateX: cardTranslate }] },
            ]}
          >
            <View style={ss.iconWrap}>
              <Ionicons name={current.icon} size={36} color={colors.lime} />
            </View>
            <Text style={ss.title}>{current.title}</Text>
            <Text style={ss.body}>{current.body}</Text>
          </Animated.View>

          {/* ── Progress dots ── */}
          <View style={ss.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  ss.dot,
                  i === step
                    ? { backgroundColor: colors.lime, width: 18, borderRadius: 3 }
                    : { backgroundColor: colors.surfaceHigh, width: 6 },
                ]}
              />
            ))}
          </View>

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[ss.cta, { backgroundColor: colors.lime }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[ss.ctaTxt, { color: colors.darkGreen }]}>
              {isLast ? 'Start budgeting' : 'Next'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(13, 31, 13, 0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      gap: spacing.lg,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    stepCount: {
      ...ff(500),
      fontSize: 12,
      color: colors.textMeta,
    },
    skipTxt: {
      ...ff(500),
      fontSize: 14,
      color: colors.textMeta,
    },
    content: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: radius.lg,
      backgroundColor: colors.lime3,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      ...ff(700),
      fontSize: 22,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.md,
      letterSpacing: -0.3,
    },
    body: {
      ...ff(400),
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 320,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    cta: {
      height: 54,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaTxt: {
      ...ff(700),
      fontSize: 16,
      letterSpacing: -0.2,
    },
  });
}
