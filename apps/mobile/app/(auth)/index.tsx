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
 * Welcome screen — entry point for unauthenticated users.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';

// ─── Carousel data ────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CAROUSEL: { icon: IoniconName; text: string }[] = [
  {
    icon: 'business-outline',
    text: 'Sync Opay, Access, Moniepoint — all your accounts in one place',
  },
  {
    icon: 'wallet-outline',
    text: 'Zero-based budgeting: give every Naira a job before you spend it',
  },
  {
    icon: 'chatbubbles-outline',
    text: 'AI nudges in Pidgin like a smart friend watching your money',
  },
];

const CAROUSEL_INTERVAL = 3200;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);

  const [activeIdx, setActiveIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      // Fade out → swap index → fade in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setActiveIdx((i) => (i + 1) % CAROUSEL.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, [fadeAnim]);

  const slide = CAROUSEL[activeIdx];

  return (
    <View style={ss.screen}>
      <StatusBar style="light" />

      {/* ── Hero area ── */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid, colors.darkGreen]}
        locations={[0, 0.5, 1]}
        style={[ss.hero, { paddingTop: insets.top + 40 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Radial glow decoration (top-left) */}
        <LinearGradient
          colors={[
            'rgba(168,224,99,0.25)',
            'rgba(168,224,99,0.10)',
            'rgba(168,224,99,0.005)',
            'transparent',
          ]}
          locations={[0, 0.3, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={ss.glowTL}
        />

        {/* Logo tile */}
        <View style={ss.logoTile}>
          <Image source={require('@/assets/images/logo.png')} style={ss.logoImg} />
        </View>

        {/* Brand name — wordmark */}
        <Image source={require('@/assets/images/wordmark.png')} style={ss.wordmark} />

        {/* Tagline */}
        <Text style={ss.tagline}>Every Kobo, Accounted For</Text>

        {/* Value carousel */}
        <Animated.View style={[ss.slideWrap, { opacity: fadeAnim }]}>
          <View style={ss.slideIconWrap}>
            <Ionicons name={slide.icon} size={36} color={colors.white} />
          </View>
          <Text style={ss.slideText}>{slide.text}</Text>
        </Animated.View>

        {/* Dots */}
        <View style={ss.dots}>
          {CAROUSEL.map((_, i) => (
            <View
              key={i}
              style={[
                ss.dot,
                i === activeIdx
                  ? { backgroundColor: colors.lime, width: 18, borderRadius: 3 }
                  : { backgroundColor: colors.overlayGhostMid },
              ]}
            />
          ))}
        </View>
      </LinearGradient>

      {/* ── Button section ── */}
      <View
        style={[
          ss.btns,
          {
            backgroundColor: colors.darkGreen,
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
          },
        ]}
      >
        <TouchableOpacity
          style={[ss.btnLime, { backgroundColor: colors.lime }]}
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.85}
        >
          <Text style={[ss.btnLimeTxt, { color: colors.darkGreen }]}>
            Get Started — It&apos;s Free
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={ss.btnGhost}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.75}
        >
          <Text style={[ss.btnGhostTxt, { color: colors.white }]}>
            I already have an account
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.darkGreen,
    },
    // ── Hero ──
    hero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxxl,
      paddingBottom: spacing.xl,
      overflow: 'hidden',
      position: 'relative',
    },
    glowTL: {
      position: 'absolute',
      top: -60,
      left: -60,
      width: 280,
      height: 280,
      borderRadius: radius.full,
      pointerEvents: 'none',
    },
    logoTile: {
      width: layout.avatarLg + spacing.lg,
      height: layout.avatarLg + spacing.lg,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImg: {
      width: layout.avatarMd + spacing.sm,
      height: layout.avatarMd + spacing.sm,
      resizeMode: 'contain',
    },
    wordmark: {
      height: layout.iconXl + spacing.mdn,
      width: 160,
      resizeMode: 'contain',
      marginBottom: spacing.xxs,
    },
    tagline: {
      ...type_.bodyReg,
      color: colors.textInverseFaint,
      letterSpacing: 0.5,
      marginBottom: spacing.xxxl + spacing.xs,
    },
    // ── Carousel ──
    slideWrap: {
      width: '100%',
      maxWidth: 300,
      alignItems: 'center',
      minHeight: 90,
      marginBottom: spacing.xl,
    },
    slideIconWrap: {
      marginBottom: spacing.smd,
    },
    slideText: {
      ...type_.bodyLg,
      ...ff(500),
      lineHeight: 26,
      color: colors.textInverseSub,
      textAlign: 'center',
    },
    // ── Dots ──
    dots: {
      flexDirection: 'row',
      gap: spacing.xxs,
      alignItems: 'center',
    },
    dot: {
      width: spacing.xxs,
      height: spacing.xxs,
      borderRadius: spacing.xxs,
    },
    // ── Buttons ──
    btns: {
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.lg,
      gap: spacing.smd,
      flexDirection: 'column',
    },
    btnLime: {
      height: layout.btnHeightLg,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnLimeTxt: {
      ...type_.btnLg,
    },
    btnGhost: {
      height: layout.btnHeightSm,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.overlayGhostBorder,
      backgroundColor: 'transparent',
    },
    btnGhostTxt: {
      ...type_.body,
    },
  });
}
