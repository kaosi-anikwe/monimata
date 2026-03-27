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
 * components/ui/BottomSheet.tsx
 *
 * Reanimated spring-driven bottom sheet
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { layout, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Content rendered inside the scrollable area. */
  children?: React.ReactNode;
  /** Extra padding at the very bottom (default: 32). */
  bottomPadding?: number;
  /** Prevent dismissal by tapping backdrop or swiping. */
  preventClose?: boolean;
  /** If false, content won't scroll (use when content has its own scroller). */
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const MAX_SHEET_H = SCREEN_H * 0.88;
const SPRING_CONFIG = { damping: 26, stiffness: 280, mass: 0.8 };
const DISMISS_THRESHOLD = 80; // px dragged down before auto-dismiss

// ─── BottomSheet ──────────────────────────────────────────────────────────────

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  bottomPadding = 32,
  preventClose = false,
  scrollable = true,
  contentStyle,
}: BottomSheetProps) {
  const colors = useTheme();

  // translateY=0 → fully visible; translateY=MAX_SHEET_H → hidden below screen
  const translateY = useSharedValue(MAX_SHEET_H);
  const backdropOpacity = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  // Keyboard offset — shifts the sheet up when keyboard is visible without
  // relying on KeyboardAvoidingView (which fights Reanimated and causes flicker).
  const keyboardOffset = useSharedValue(0);

  // Track whether modal should be mounted (avoids flash before dismiss animation ends)
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Animate in on next frame
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING_CONFIG);
        backdropOpacity.value = withTiming(1, { duration: 220 });
      });
    } else {
      dismiss();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    translateY.value = withSpring(MAX_SHEET_H, { damping: 20, stiffness: 180 });
    backdropOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(setMounted, false);
    });
    if (!preventClose) onClose();
  }, [onClose, preventClose, translateY, backdropOpacity]);

  // Swipe-to-dismiss PanResponder
  const panRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragOffset.value = g.dy;
          translateY.value = g.dy;
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
          dismiss();
        } else {
          translateY.value = withSpring(0, SPRING_CONFIG);
          dragOffset.value = 0;
        }
      },
    }),
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      keyboardOffset.value = withTiming(e.endCoordinates.height, { duration: 250 });
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      keyboardOffset.value = withTiming(0, { duration: 250 });
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - keyboardOffset.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!mounted) return null;

  const sheetContent = (
    <Animated.View
      style={[
        s.sheet,
        { backgroundColor: colors.cardBg, maxHeight: MAX_SHEET_H },
        sheetStyle,
      ]}
    >
      {/* Drag handle */}
      <View
        {...(!preventClose ? panRef.current.panHandlers : {})}
        style={s.handleArea}
      >
        <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />
      </View>

      {/* Title / subtitle */}
      {title && (
        <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>
      )}
      {subtitle && (
        <Text style={[s.subtitle, { color: colors.textMeta }]}>{subtitle}</Text>
      )}

      {/* Content */}
      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { paddingBottom: bottomPadding },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ paddingBottom: bottomPadding }, contentStyle]}>
          {children}
        </View>
      )}
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={preventClose ? undefined : onClose}
    >
      <View style={s.root}>
        {/* Backdrop */}
        {!preventClose && (
          <TouchableWithoutFeedback onPress={dismiss} accessibilityLabel="Close sheet">
            <Animated.View
              style={[s.backdrop, { backgroundColor: colors.overlayDarkHeavy }, backdropStyle]}
            />
          </TouchableWithoutFeedback>
        )}
        {preventClose && (
          <Animated.View style={[s.backdrop, { backgroundColor: colors.overlayDarkHeavy }, backdropStyle]} pointerEvents="none" />
        )}

        {sheetContent}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13,31,13,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.smd,
  },
  handle: {
    width: layout.sheetHandle.width,
    height: layout.sheetHandle.height,
    borderRadius: 2,
  },
  title: {
    ...type_.h2,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.smd,
  },
  subtitle: {
    ...type_.bodyReg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    lineHeight: 20,
  },
});
