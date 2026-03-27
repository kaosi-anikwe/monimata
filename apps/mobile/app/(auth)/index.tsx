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
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ff } from '@/lib/typography';
import { radius, spacing } from '@/lib/tokens';
import { useTheme, type ThemeColors } from '@/lib/theme';

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
    text: 'AI nudges in Pidgin — like a knowledgeable friend watching your money',
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
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={[ss.hero, { paddingTop: insets.top + 40 }]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      >
        {/* Radial glow decoration (top-left) */}
        <View style={ss.glowTL} />

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
      paddingHorizontal: 28,
      paddingBottom: spacing.xl,
      overflow: 'hidden',
      position: 'relative',
    },
    glowTL: {
      position: 'absolute',
      top: -80,
      left: -60,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: colors.limeGlow,
      pointerEvents: 'none',
    },
    logoTile: {
      width: 72,
      height: 72,
      borderRadius: 22,
      // backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
      // marginBottom: spacing.sm,
      // shadowColor: colors.lime,
      // shadowOffset: { width: 0, height: 8 },
      // shadowOpacity: 0.35,
      // shadowRadius: 20,
      // elevation: 12,
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
      marginBottom: 6,
    },
    tagline: {
      ...ff(400),
      fontSize: 13,
      color: colors.textInverseFaint,
      letterSpacing: 0.5,
      marginBottom: 36,
    },
    // ── Carousel ──
    slideWrap: {
      width: '100%',
      maxWidth: 300,
      alignItems: 'center',
      minHeight: 90,
      marginBottom: 20,
    },
    slideIconWrap: {
      marginBottom: 10,
    },
    slideText: {
      ...ff(500),
      fontSize: 15,
      color: colors.textInverseSub,
      textAlign: 'center',
      lineHeight: 23,
    },
    // ── Dots ──
    dots: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    // ── Buttons ──
    btns: {
      paddingHorizontal: 24,
      paddingTop: spacing.lg,
      gap: 10,
      flexDirection: 'column',
    },
    btnLime: {
      height: 54,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnLimeTxt: {
      ...ff(700),
      fontSize: 16,
      letterSpacing: -0.2,
    },
    btnGhost: {
      height: 50,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.overlayGhostBorder,
      backgroundColor: 'transparent',
    },
    btnGhostTxt: {
      ...ff(600),
      fontSize: 14,
    },
  });
}
