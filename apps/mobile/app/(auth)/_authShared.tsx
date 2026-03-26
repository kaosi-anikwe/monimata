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
 *   TrustCard   — shield badge used on BVN + link-bank screens
 *   s           — shared StyleSheet matching .auth-hdr / .inp / .btn-green / .x-btn.dk
 */

import { Ionicons } from '@expo/vector-icons';
import { useRef, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ff } from '@/lib/typography';
import { glass, radius, spacing } from '@/lib/tokens';
import { useTheme, type ThemeColors } from '@/lib/theme';

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
          backgroundColor: colors.white,
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
    ...ff(400),
    fontSize: 15,
    paddingHorizontal: 14,
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
  return <Ionicons name={open ? 'eye-off-outline' : 'eye-outline'} size={18} color={color} />;
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
// Referenced across login, register, verify-bvn, and link-bank.

export const s = StyleSheet.create({
  screen: { flex: 1 },

  // Dark green curved header — matches .auth-hdr in mockup
  authHdr: {
    paddingTop: 54,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 28,
    borderBottomLeftRadius: radius.xl,   // 28 pt — matches border-radius: 0 0 28px 28px
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  // .x-btn.dk — frosted-glass back button for dark-green auth headers
  xBtnDk: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.borderWhiteStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  // Legacy alias — kept so existing callers compile without changes
  backBtn: { marginBottom: 14 },
  authTitle: { ...ff(800), fontSize: 22, letterSpacing: -0.4, marginBottom: 4 },
  authSub: { ...ff(400), fontSize: 14, lineHeight: 21 },

  // Scrollable body below header
  body: { padding: spacing.xxl, paddingBottom: 48 },

  // Form field row
  field: { marginBottom: 14 },
  fieldLbl: { ...ff(600), fontSize: 12, marginBottom: 5 },
  fieldErr: { ...ff(400), fontSize: 12, marginTop: 4 },

  // Error banner
  errorBanner: { borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { ...ff(400), fontSize: 14 },

  // btn-green: --gp bg, white text, height 52 — matches .btn-green in mockup
  btnGreen: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { ...ff(700), fontSize: 15 },

  // Bottom nav link (e.g. "Already have an account?")
  navLink: { marginTop: 14, alignItems: 'center' },
  navLinkText: { ...ff(400), fontSize: 13 },

  // Terms of service note — below submit button on register screen
  tosWrap: { marginTop: 12, paddingHorizontal: 4, alignItems: 'center' },
  tosText: { ...ff(400), fontSize: 11, textAlign: 'center', lineHeight: 17 },
  tosLink: { ...ff(600), textDecorationLine: 'underline' },

  // Password field helpers
  pwWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  forgot: { ...ff(400), fontSize: 12 },
});

// ─── TrustCard ────────────────────────────────────────────────────────────────
// Used on BVN + link-bank screens — green badge with shield icon + text.

export function TrustCard({ text, colors }: { text: string; colors: ThemeColors }) {
  return (
    <View
      style={[
        trustS.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} style={{ marginTop: 1 }} />
      <Text style={[trustS.text, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const trustS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  text: { ...ff(400), fontSize: 12, lineHeight: 19, flex: 1 },
});

// Expo Router requires a default export from every file inside app/.
// This file is a shared primitives module, not a screen — export null to satisfy
// the router without rendering anything.
export default function AuthShared() { return null; }
