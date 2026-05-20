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
 * app/(auth)/_authShared.tsx
 *
 * Shared UI primitives for the auth flow.
 *
 * Exports:
 *   AuthInput   — 48 pt styled TextInput with animated brand-green focus ring
 *   BackBtn     — frosted-glass back button (.x-btn.dk) for dark headers (preferred)
 *   BackArrow   — raw white arrow icon (kept for compat; use BackBtn instead)
 *   EyeIcon     — password visibility toggle icon
 *   TrustCard   — shield badge with shield icon + text
 *   s           — shared StyleSheet matching .auth-hdr / .inp / .btn-green / .x-btn.dk
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, type ReactNode } from 'react';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useTheme, type ThemeColors } from '@/lib/theme';
import { glass, layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';

// ─── AuthInput ────────────────────────────────────────────────────────────────
// Matches .inp: height 48, radius --rm (16), border 1.5px, focus → brand green glow.

export interface AuthInputProps extends TextInputProps {
  hasError?: boolean;
  colors: ThemeColors;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AuthInput({ hasError, colors, containerStyle, style, ...rest }: AuthInputProps) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.brand],
  });

  function handleFocus() {
    Animated.timing(focusAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    rest.onFocus?.({} as Parameters<NonNullable<TextInputProps['onFocus']>>[0]);
  }

  function handleBlur() {
    Animated.timing(focusAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    rest.onBlur?.({} as Parameters<NonNullable<TextInputProps['onBlur']>>[0]);
  }

  return (
    <Animated.View
      style={[
        authInputS.wrap,
        {
          borderColor: hasError ? colors.error : borderColor,
          backgroundColor: colors.cardBg,
        },
        containerStyle,
      ]}
    >
      <TextInput
        style={[authInputS.text, { color: colors.textPrimary }, style as StyleProp<TextStyle>]}
        placeholderTextColor={colors.textTertiary}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
    </Animated.View>
  );
}

const authInputS = StyleSheet.create({
  wrap: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    ...type_.btnLg,
    paddingHorizontal: spacing.mdn,
    height: '100%',
  },
});

// ─── BackBtn ──────────────────────────────────────────────────────────────────
// Matches .x-btn.dk — 36×36 frosted-glass pill used on all dark-green auth headers.
// Pass `onPress` and optionally `style` for positioning overrides.

export function BackBtn({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.xBtnDk, style]}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="arrow-back" size={20} color={colors.white} />
    </TouchableOpacity>
  );
}

// ─── BackArrow ────────────────────────────────────────────────────────────────
// Raw icon only — kept for backward compat. Prefer BackBtn.

export function BackArrow() {
  const colors = useTheme();
  return <Ionicons name="arrow-back" size={20} color={colors.white} />;
}

// ─── EyeIcon ─────────────────────────────────────────────────────────────────

export function EyeIcon({ open, color }: { open: boolean; color: string }) {
  return <Ionicons name={open ? 'eye-off-outline' : 'eye-outline'} size={type_.bodyXl.fontSize} color={color} />;
}

// ─── AuthHdr ──────────────────────────────────────────────────────────────────
// Dark green gradient header — wraps all auth screen headers.

export function AuthHdr({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={s.authHdr}>
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
// Referenced across login, register, and onboarding screens.

export const s = StyleSheet.create({
  screen: { flex: 1 },

  // authHdr
  authHdr: {
    paddingTop: layout.headerPaddingTop,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  // .x-btn.dk — frosted-glass back button for dark-green auth headers
  xBtnDk: {
    width: layout.iconBtnSize,
    height: layout.iconBtnSize,
    borderRadius: radius.smd,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.borderWhiteStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.mdn,
  },
  // Legacy alias — kept so existing callers compile without changes
  backBtn: { marginBottom: spacing.mdn },
  authTitle: { ...type_.h1, marginBottom: spacing.xs },
  authSub: { ...type_.body, lineHeight: 24 },

  // Scrollable body below header
  body: { padding: spacing.xxl, paddingBottom: spacing.xxxl + spacing.lg },

  // Form field row
  field: { marginBottom: spacing.mdn },
  fieldLbl: { ...type_.small, marginBottom: spacing.xxs },
  fieldErr: { ...type_.small, marginTop: spacing.xs },

  // Error banner
  errorBanner: { borderRadius: radius.xs, padding: spacing.md, marginBottom: spacing.lg },
  errorText: { ...type_.body },

  // btn-green: --gp bg, white text, height 52 — matches .btn-green in mockup
  btnGreen: {
    height: layout.btnHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { ...type_.btnLg },

  // Bottom nav link (e.g. "Already have an account?")
  navLink: { marginTop: spacing.mdn, alignItems: 'center' },
  navLinkText: { ...type_.bodyReg },

  // Terms of service note — below submit button on register screen
  tosWrap: { marginTop: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center' },
  tosText: { ...type_.caption, textAlign: 'center', lineHeight: 20 },
  tosLink: { ...ff(600), textDecorationLine: 'underline' },

  // Password field helpers
  pwWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: spacing.mdn, top: 0, bottom: 0, justifyContent: 'center' },
  forgot: { ...type_.small },
});

// ─── TrustCard ────────────────────────────────────────────────────────────────
// Green badge with shield icon + text — reusable security/info card.

export function TrustCard({ text, colors }: { text: string; colors: ThemeColors }) {
  return (
    <View
      style={[
        trustS.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons name="shield-checkmark-outline" size={type_.bodyXl.fontSize} color={colors.brand} style={{ marginTop: 1 }} />
      <Text style={[trustS.text, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const trustS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.smd,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.mdn,
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
  },
  text: { ...type_.small, lineHeight: 22, flex: 1 },
});

// Expo Router requires a default export from every file inside app/.
// This file is a shared primitives module, not a screen — export null to satisfy
// the router without rendering anything.
export default function AuthShared() { return null; }
