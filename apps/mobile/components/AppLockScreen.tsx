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

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';
import { clearAuth, logout } from '@/store/authSlice';
import { useAppDispatch } from '@/store/hooks';
import type { RootState } from '@/store';

type BiometricKind = 'fingerprint' | 'face' | 'unknown';

// expo-local-authentication only tells us what hardware *supports*, not what's
// enrolled. Use platform as a reliable proxy for the icon: Android devices
// overwhelmingly use fingerprint; iOS uses Face ID.
function getPlatformBiometricKind(): BiometricKind {
  if (Platform.OS === 'ios') return 'face';
  return 'fingerprint';
}

interface Props {
  onUnlock: () => Promise<boolean>;
  /** Called synchronously before clearAuth() so the caller can snapshot the current route. */
  onPasswordLogin?: () => void;
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

/**
 * Full-screen lock UI rendered over all app content when biometric lock is active.
 * Detects Face ID vs fingerprint to show the appropriate icon and label.
 */
export function AppLockScreen({ onUnlock, onPasswordLogin }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const user = useSelector((s: RootState) => s.auth.user);

  const biometricKind = getPlatformBiometricKind();
  const isFace = biometricKind === 'face';
  const biometricIcon: React.ComponentProps<typeof Ionicons>['name'] = isFace
    ? 'scan-outline'
    : 'finger-print-outline';

  const initials = getInitials(user?.first_name, user?.last_name);
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Welcome back';

  function handleLoginWithPassword() {
    // Save the current route BEFORE wiping auth, so RootNavigator can restore
    // it after the user re-authenticates with their password.
    onPasswordLogin?.();
    // clearAuth() only wipes local Redux state — it does not invalidate the
    // refresh token server-side, so the user can log back in smoothly.
    dispatch(clearAuth());
    router.replace({ pathname: '/(auth)/login', params: { prefillEmail: user?.email ?? '' } });
  }

  function handleLogout() {
    dispatch(logout()).then(() => router.replace('/(auth)'));
  }

  return (
    <View style={[s.root, { backgroundColor: colors.darkGreen }]}>
      <StatusBar style="light" />

      {/* ── Gradient hero (top ~55%) ── */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={[s.hero, { paddingTop: insets.top + 28 }]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      >
        {/* Glow decoration */}
        <View style={[s.glow, { backgroundColor: colors.limeGlow }]} pointerEvents="none" />

        {/* Logo + wordmark */}
        <View style={s.logoTile}>
          <Image source={require('@/assets/images/logo.png')} style={s.logoImg} />
        </View>
        <Image source={require('@/assets/images/wordmark.png')} style={s.wordmark} />

        {/* Initials avatar */}
        <View style={[s.avatar, { backgroundColor: colors.brand, borderColor: colors.limeBorderStrong }]}>
          <Text style={[s.avatarText, { color: colors.lime, ...ff(800) }]}>{initials}</Text>
        </View>

        {/* User name */}
        <Text style={[s.name, { color: colors.white, ...ff(700) }]}>{displayName}</Text>

        {/* Biometric icon */}
        <TouchableOpacity
          onPress={onUnlock}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Tap to authenticate"
          style={s.biometricIconBtn}
        >
          <Ionicons name={biometricIcon} size={56} color={colors.lime} />
        </TouchableOpacity>

        {/* Helper text */}
        <TouchableOpacity onPress={onUnlock} activeOpacity={0.7}>
          <Text style={[s.helperText, { color: colors.textInverseFaint, ...ff(500) }]}>
            Tap to authenticate
          </Text>
        </TouchableOpacity>

        {/* Footer actions */}
        <View style={[s.footer, { position: 'absolute', bottom: insets.bottom + spacing.xl }]}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={[s.footerLink, { color: colors.errorSubtle, ...ff(600) }]}>Log Out</Text>
          </TouchableOpacity>

          <View style={[s.footerDivider, { backgroundColor: colors.overlayGhostBorder }]} />

          <TouchableOpacity
            onPress={handleLoginWithPassword}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Login with password"
          >
            <Text style={[s.footerLink, { color: colors.textInverseFaint, ...ff(600) }]}>Login with Password</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    pointerEvents: 'none',
  },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  wordmark: {
    height: 36,
    width: 160,
    resizeMode: 'contain',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 26, lineHeight: 30 },
  name: {
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: spacing.xxl,
  },
  biometricIconBtn: {
    marginBottom: spacing.md,
  },
  helperText: {
    fontSize: 13,
    letterSpacing: 0.2,
    marginBottom: spacing.xxl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  footerLink: { fontSize: 14 },
  footerDivider: { width: 1, height: 14 },
});
