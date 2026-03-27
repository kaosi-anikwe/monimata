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
 * AppWelcome — full-screen welcome walkthrough shown once per account,
 * immediately after the user lands on the main app for the first time.
 *
 * Four static slides explain the zero-based budgeting philosophy and the
 * key sections of MoniMata before the contextual spotlight tours take over.
 *
 * Shown as a Modal so it layers above the tab navigator without affecting
 * the navigation stack.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { releaseWelcome, resetWelcomeBridgeForUser } from '@/lib/welcomeBridge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';

// ── Store key ─────────────────────────────────────────────────────────────────

const SEEN_PREFIX = 'appWelcomeSeen_v1_';

// ── Slide definitions ─────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Slide {
  icon: IoniconName;
  accentIcon?: IoniconName;
  title: string;
  body: string;
  /** Bullet points shown below the body (optional). */
  bullets?: string[];
}

const SLIDES: Slide[] = [
  {
    icon: 'wallet-outline',
    title: 'Every naira gets a job',
    body: 'Zero-based budgeting means you assign every naira you earn to a purpose — bills, food, savings, or fun — until nothing is left unassigned.',
    bullets: [
      'Income comes in → assign it all out',
      'When a category is empty, stop spending there',
      'Move money between categories any time',
    ],
  },
  {
    icon: 'swap-horizontal-outline',
    title: 'To Be Budgeted (TBB)',
    body: 'TBB is the pile of money you\'ve received but haven\'t assigned yet. Your goal every month: get TBB to ₦0.',
    bullets: [
      'Green TBB = money waiting for a job',
      'Red TBB = you\'ve over-assigned (fix it!)',
      'Use Auto-Assign to fill targets in one tap',
    ],
  },
  {
    icon: 'grid-outline',
    title: 'Budget categories',
    body: 'Groups hold related categories. Each category tracks what you\'ve assigned vs. what you\'ve spent, with a progress bar that changes colour as you approach the limit.',
    bullets: [
      'Tap any category to assign or move money',
      'Set a monthly target so MoniMata can remind you',
      'Hide categories you\'re not using right now',
    ],
  },
  {
    icon: 'card-outline',
    accentIcon: 'repeat-outline',
    title: 'Accounts, bills & more',
    body: 'Link a bank account to import transactions automatically. Set up recurring bills so they\'re never a surprise. Split transactions, track challenges, and set savings targets.',
    bullets: [
      'Transactions tab — search, filter, and split',
      'Accounts tab — balances and linked banks',
      'Bills & recurring — scheduled payments',
    ],
  },
];

const SCREEN_W = Dimensions.get('window').width;

// ── Component ─────────────────────────────────────────────────────────────────

interface AppWelcomeProps {
  /** The currently logged-in user's ID — used to scope the seen flag. */
  userId: string;
  /** Called when the welcome is dismissed OR was already seen (so callers can
   *  always rely on this to know the welcome is out of the way). */
  onDismiss?: () => void;
}

export function AppWelcome({ userId, onDismiss }: AppWelcomeProps) {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  // Dot opacity animations — one per slide.
  const dotOpacities = useRef(SLIDES.map((_, i) => new RNAnimated.Value(i === 0 ? 1 : 0.3))).current;

  useEffect(() => {
    if (!userId) return;
    resetWelcomeBridgeForUser(userId);
    const key = SEEN_PREFIX + userId;
    SecureStore.getItemAsync(key).then((seen) => {
      if (!seen) {
        setVisible(true);
      } else {
        // Returning user — welcome already seen; release immediately.
        releaseWelcome();
        onDismiss?.();
      }
    }).catch(() => { releaseWelcome(); onDismiss?.(); });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    SecureStore.setItemAsync(SEEN_PREFIX + userId, '1').catch(() => { });
    setVisible(false);
    releaseWelcome();
    onDismiss?.();
  }

  function goToPage(idx: number) {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    setPage(idx);
    pageRef.current = idx;
    SLIDES.forEach((_, i) => {
      RNAnimated.timing(dotOpacities[i], {
        toValue: i === idx ? 1 : 0.3,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }

  function handleNext() {
    const next = pageRef.current + 1;
    if (next >= SLIDES.length) {
      dismiss();
    } else {
      goToPage(next);
    }
  }

  const isLast = page === SLIDES.length - 1;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={[s.root, { backgroundColor: colors.darkGreen }]}>
        {/* Skip button */}
        <TouchableOpacity
          style={[s.skipBtn, { top: insets.top + 12 }]}
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip welcome"
        >
          <Text style={[s.skipTxt, { color: colors.lime }]}>Skip</Text>
        </TouchableOpacity>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            if (idx !== pageRef.current) {
              pageRef.current = idx;
              setPage(idx);
              SLIDES.forEach((_, i) => {
                RNAnimated.timing(dotOpacities[i], {
                  toValue: i === idx ? 1 : 0.3,
                  duration: 200,
                  useNativeDriver: true,
                }).start();
              });
            }
          }}
          style={s.scroller}
          contentContainerStyle={s.scrollContent}
        >
          {SLIDES.map((slide, idx) => (
            <SlideView
              key={idx}
              slide={slide}
              colors={colors}
              insets={insets}
            />
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <RNAnimated.View
              key={i}
              style={[
                s.dot,
                { backgroundColor: colors.lime, opacity: dotOpacities[i] },
                i === page && s.dotActive,
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: colors.lime }]}
            onPress={handleNext}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next'}
          >
            <Text style={[s.nextTxt, { color: colors.darkGreen }]}>
              {isLast ? "Let's go  🚀" : 'Next'}
            </Text>
            {!isLast && (
              <Ionicons name="arrow-forward" size={18} color={colors.darkGreen} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Slide view ────────────────────────────────────────────────────────────────

function SlideView({
  slide,
  colors,
  insets,
}: {
  slide: Slide;
  colors: ReturnType<typeof useTheme>;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <View style={[s.slide, { width: SCREEN_W, paddingTop: insets.top + 72 }]}>
      {/* Icon */}
      <View style={[s.iconWrap, { backgroundColor: 'rgba(163,230,53,0.12)', borderColor: 'rgba(163,230,53,0.25)' }]}>
        <Ionicons name={slide.icon} size={44} color={colors.lime} />
        {slide.accentIcon && (
          <View style={[s.accentIconWrap, { backgroundColor: colors.darkGreenMid }]}>
            <Ionicons name={slide.accentIcon} size={16} color={colors.lime} />
          </View>
        )}
      </View>

      {/* Text */}
      <Text style={[s.slideTitle, { color: colors.lime }]}>{slide.title}</Text>
      <Text style={[s.slideBody, { color: 'rgba(255,255,255,0.72)' }]}>{slide.body}</Text>

      {/* Bullets */}
      {slide.bullets && (
        <View style={s.bullets}>
          {slide.bullets.map((b) => (
            <View key={b} style={s.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.lime} style={s.bulletIcon} />
              <Text style={[s.bulletTxt, { color: 'rgba(255,255,255,0.82)' }]}>{b}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  skipBtn: {
    position: 'absolute',
    right: spacing.xl,
    zIndex: 10,
  },
  skipTxt: {
    ...ff(600),
    fontSize: 14,
    letterSpacing: 0.2,
  },
  scroller: {
    flex: 1,
  },
  scrollContent: {
    // width is set per-slide
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  accentIconWrap: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    ...ff(800),
    fontSize: 26,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 32,
  },
  slideBody: {
    ...ff(400),
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  bullets: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletIcon: {
    marginTop: 2,
  },
  bulletTxt: {
    ...ff(500),
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    borderRadius: 10,
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
  },
  nextBtn: {
    height: 52,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  nextTxt: {
    ...ff(700),
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
