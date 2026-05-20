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
 * About screen — app version, open-source disclosure, and GitHub link.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';

const GITHUB_URL = 'https://github.com/kaosi-anikwe/monimata';

export default function AboutScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);

  useStatusBarStyle('light');

  const version = Constants.expoConfig?.version ?? '—';
  const year = new Date().getFullYear();

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="About MoniMata"
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.md}
      />

      <ScrollView
        contentContainerStyle={[ss.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Branding card ─────────────────────────────────────────────── */}
        <View style={[ss.brandCard, { backgroundColor: colors.darkGreen }]}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={ss.logo}
            resizeMode="contain"
          />
          <Image
            source={require('@/assets/images/wordmark.png')}
            style={ss.wordmark}
            resizeMode="contain"
          />
          <Text style={ss.tagline}>Every Kobo, Accounted For</Text>
          <View style={[ss.versionPill, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
            <Text style={[type_.caption, { color: colors.white, ...ff(500) }]}>
              v{version}
            </Text>
          </View>
        </View>

        {/* ── Open source ───────────────────────────────────────────────── */}
        <View style={[ss.card, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <View style={ss.cardHeader}>
            <View style={[ss.iconWrap, { backgroundColor: colors.successSubtle }]}>
              <Ionicons name="logo-github" size={20} color={colors.successText} />
            </View>
            <Text style={[ss.cardTitle, { color: colors.textPrimary }]}>Free & Open Source</Text>
          </View>
          <Text style={[ss.cardBody, { color: colors.textSecondary }]}>
            MoniMata is free, open-source software licensed under the{' '}
            <Text style={{ color: colors.brand, ...ff(600) }}>GNU Affero General Public License v3.0</Text>
            . You are free to use, study, modify, and distribute it under the same terms.
          </Text>
          <TouchableOpacity
            style={[ss.githubBtn, { backgroundColor: colors.brand }]}
            onPress={() => Linking.openURL(GITHUB_URL)}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="View source code on GitHub"
            accessibilityHint="Opens GitHub in your browser"
          >
            <Ionicons name="logo-github" size={18} color={colors.white} />
            <Text style={[ss.githubBtnText, { color: colors.white }]}>View on GitHub</Text>
            <Ionicons name="open-outline" size={14} color={colors.white} style={{ opacity: 0.7 }} />
          </TouchableOpacity>
        </View>

        {/* ── Legal & credits ───────────────────────────────────────────── */}
        <View style={[ss.card, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <View style={ss.cardHeader}>
            <View style={[ss.iconWrap, { backgroundColor: colors.infoSubtle }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.info} />
            </View>
            <Text style={[ss.cardTitle, { color: colors.textPrimary }]}>License</Text>
          </View>
          <Text style={[ss.cardBody, { color: colors.textSecondary }]}>
            Copyright © {year} MoniMata Contributors.{'\n\n'}
            This program is distributed in the hope that it will be useful, but{' '}
            <Text style={{ ...ff(500) }}>without any warranty</Text>
            . See the GNU AGPL-3.0 for details.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://www.gnu.org/licenses/agpl-3.0.html')}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="Read the AGPL-3.0 license"
          >
            <Text style={[type_.small, { color: colors.brand, marginTop: spacing.xs }]}>
              Read AGPL-3.0 →
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <Text style={[ss.footer, { color: colors.textTertiary }]}>
          Built with ❤️ for Nigerians
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },

    // Branding card
    brandCard: {
      borderRadius: radius.xl,
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    },
    logo: {
      width: 64,
      height: 64,
    },
    wordmark: {
      width: 140,
      height: 28,
    },
    tagline: {
      ...type_.caption,
      ...ff(500),
      color: colors.textInverseFaint,
      letterSpacing: 0.3,
    },
    versionPill: {
      borderWidth: 1,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      marginTop: spacing.xs,
    },

    // Info cards
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: spacing.lg,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      ...type_.body,
      ...ff(700),
    },
    cardBody: {
      ...type_.small,
      lineHeight: 20,
    },

    // GitHub button
    githubBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    githubBtnText: {
      ...type_.body,
      ...ff(600),
    },

    // Footer
    footer: {
      ...type_.caption,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
}
