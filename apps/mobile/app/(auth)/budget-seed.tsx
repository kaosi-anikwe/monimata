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
 * Budget Seed Preview — shown after the Onboarding Questionnaire.
 *
 * Receives `answers` (JSON-encoded `OnboardingAnswers`) as a route param.
 * Displays a personalised set of seed category groups that were generated
 * based on the user's questionnaire answers.
 *
 * Phase 16 integration note:
 *   1. The Onboarding screen should POST /users/onboarding before navigating here.
 *   2. Pass the API response (seeded groups) as a second param, e.g.:
 *        params: { answers: JSON.stringify(answers), seedGroups: JSON.stringify(apiGroups) }
 *   3. Replace FAKE_SEED_GROUPS below with the parsed apiGroups.
 *   4. The "Let's start budgeting!" CTA should call PATCH /users/me { onboarding_complete: true }
 *      before navigating to /(tabs), so the onboarding flow is not shown again.
 *
 * API endpoint:
 *   POST /users/onboarding
 *   Body:  { income_type: string | null, housing: string | null, goal: string | null }
 *   Returns: { groups: SeedGroup[] }
 */

import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ff } from '@/lib/typography';
import { useAppDispatch } from '@/store/hooks';
import { markOnboarded } from '@/store/authSlice';
import type { OnboardingAnswers } from './onboarding';
import { radius, shadow, spacing } from '@/lib/tokens';
import { useTheme, type ThemeColors } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SeedCategory {
  name: string;
  targetSuggested?: boolean;
  /** visual accent: 'brand' = dark green dot, 'muted' = grey dot */
  accent: 'brand' | 'muted';
}

interface SeedGroup {
  id: string;
  label: string;
  icon: IoniconName;
  categories: SeedCategory[];
}

// ─── Fake seed data (Phase 16 replaces with API response) ─────────────────────

const FAKE_SEED_GROUPS: SeedGroup[] = [
  {
    id: 'housing',
    label: 'Housing',
    icon: 'home-outline',
    categories: [
      { name: 'Rent', targetSuggested: true, accent: 'brand' },
      { name: 'Electricity / NEPA', targetSuggested: true, accent: 'brand' },
      { name: 'Service Charge', accent: 'muted' },
      { name: 'Home Maintenance', accent: 'muted' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Groceries',
    icon: 'restaurant-outline',
    categories: [
      { name: 'Groceries', targetSuggested: true, accent: 'brand' },
      { name: 'Eating Out', accent: 'muted' },
      { name: 'Food Delivery', accent: 'muted' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: 'car-outline',
    categories: [
      { name: 'Fuel', accent: 'muted' },
      { name: 'Uber / Bolt', accent: 'muted' },
      { name: 'Vehicle Maintenance', accent: 'muted' },
    ],
  },
  {
    id: 'savings',
    label: 'Savings & Goals',
    icon: 'save-outline',
    categories: [
      { name: 'Emergency Fund', targetSuggested: true, accent: 'brand' },
      { name: 'Monthly Savings', accent: 'brand' },
      { name: 'Investment Pool', accent: 'muted' },
      { name: 'Goals (Custom)', accent: 'muted' },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'phone-portrait-outline',
    categories: [
      { name: 'Airtime & Data', accent: 'muted' },
      { name: 'Personal Care', accent: 'muted' },
      { name: 'Entertainment', accent: 'muted' },
      { name: 'Clothing', accent: 'muted' },
    ],
  },
];

const TOTAL_CATEGORIES = FAKE_SEED_GROUPS.reduce((n, g) => n + g.categories.length, 0);
const TOTAL_TARGETS = FAKE_SEED_GROUPS.reduce(
  (n, g) => n + g.categories.filter((c) => c.targetSuggested).length,
  0,
);

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BudgetSeedScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);
  const dispatch = useAppDispatch();

  // answers forwarded from onboarding — available for Phase 16 API call
  const { answers: answersParam } = useLocalSearchParams<{ answers: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const answers: OnboardingAnswers | null = answersParam
    ? (JSON.parse(answersParam) as OnboardingAnswers)
    : null;

  // Accordion state: set of expanded group ids; first group open by default
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['housing']));

  function toggleGroup(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <View style={ss.screen}>
      <StatusBar style="light" />

      {/* ── Dark green header with radial glow ── */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={[ss.header, { paddingTop: insets.top + 16 }]}
      >
        {/* Glow decoration */}
        <View style={ss.glowDecor} />

        {/* Trophy icon */}
        <View style={ss.trophyWrap}>
          <Ionicons name="trophy-outline" size={48} color={colors.lime} />
        </View>

        <Text style={ss.title}>Your budget is ready!</Text>
        <Text style={ss.headerSub}>
          Based on your answers we&apos;ve built a personalised budget. Change anything later —
          this is just your start.
        </Text>

        {/* Stats row */}
        <View style={ss.statsRow}>
          <View style={ss.stat}>
            <Text style={ss.statNum}>{TOTAL_CATEGORIES}</Text>
            <Text style={ss.statLbl}>Categories</Text>
          </View>
          <View style={ss.statDivider} />
          <View style={ss.stat}>
            <Text style={ss.statNum}>{FAKE_SEED_GROUPS.length}</Text>
            <Text style={ss.statLbl}>Groups</Text>
          </View>
          <View style={ss.statDivider} />
          <View style={ss.stat}>
            <Text style={ss.statNum}>{TOTAL_TARGETS}</Text>
            <Text style={ss.statLbl}>Targets</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Accordion list ── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[ss.listHint, { color: colors.textMeta }]}>
          Tap a group to preview categories
        </Text>

        {FAKE_SEED_GROUPS.map((group) => {
          const isOpen = expanded.has(group.id);
          return (
            <View
              key={group.id}
              style={[ss.seedGroup, { borderColor: colors.border, ...shadow.sm }]}
            >
              {/* Group header row */}
              <TouchableOpacity
                style={[ss.groupHdr, { backgroundColor: colors.surface }]}
                onPress={() => toggleGroup(group.id)}
                activeOpacity={0.75}
              >
                <View style={ss.groupHdrLeft}>
                  <View
                    style={[ss.groupIconTile, { backgroundColor: colors.surfaceElevated }]}
                  >
                    <Ionicons name={group.icon} size={16} color={colors.brand} />
                  </View>
                  <Text style={[ss.groupName, { color: colors.textSecondary }]}>
                    {group.label.toUpperCase()}
                  </Text>
                </View>
                <View style={ss.groupHdrRight}>
                  <Text style={[ss.groupCount, { color: colors.textMeta }]}>
                    {group.categories.length} categories
                  </Text>
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color={colors.textTertiary}
                  />
                </View>
              </TouchableOpacity>

              {/* Expandable category rows */}
              {isOpen
                ? group.categories.map((cat, idx) => (
                  <View
                    key={idx}
                    style={[
                      ss.catRow,
                      {
                        borderBottomColor: colors.separator,
                        borderBottomWidth: idx < group.categories.length - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        ss.catDot,
                        {
                          backgroundColor:
                            cat.accent === 'brand' ? colors.brand : colors.textMeta,
                        },
                      ]}
                    />
                    <Text style={[ss.catName, { color: colors.textPrimary }]}>{cat.name}</Text>
                    {cat.targetSuggested ? (
                      <View style={[ss.targetBadge, { backgroundColor: colors.surface }]}>
                        <Ionicons name="flag-outline" size={9} color={colors.brand} />
                        <Text style={[ss.targetBadgeTxt, { color: colors.brand }]}>
                          Target suggested
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))
                : null}
            </View>
          );
        })}

        <Text style={[ss.footerHint, { color: colors.textMeta }]}>
          You can rename, add, or remove any category in Budget Settings
        </Text>

        {/* ── CTAs ── */}
        <TouchableOpacity
          style={[ss.startBtn, { backgroundColor: colors.lime }]}
          onPress={() => dispatch(markOnboarded())}
          activeOpacity={0.85}
        >
          <Text style={[ss.startTxt, { color: colors.darkGreen }]}>
            Let&apos;s start budgeting!
          </Text>
          <Ionicons name="rocket-outline" size={18} color={colors.darkGreen} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            ss.customiseBtn,
            { borderColor: colors.brand, backgroundColor: colors.surface },
          ]}
          onPress={() => {
            // Mark onboarded first so the navigator switches to (tabs), then
            // push budget-edit on top of the tab stack.
            dispatch(markOnboarded());
            router.push('/budget-edit' as never);
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="settings-outline" size={16} color={colors.brand} />
          <Text style={[ss.customiseTxt, { color: colors.brand }]}>Customise my categories</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ── Header ──
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    glowDecor: {
      position: 'absolute',
      top: -60,
      right: -60,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.limeGlow,
    },
    trophyWrap: {
      alignSelf: 'center',
      marginBottom: 14,
    },
    title: {
      ...ff(800),
      fontSize: 22,
      color: colors.white,
      letterSpacing: -0.4,
      textAlign: 'center',
      marginBottom: 8,
    },
    headerSub: {
      ...ff(400),
      fontSize: 14,
      color: colors.textInverseSecondary,
      lineHeight: 21,
      textAlign: 'center',
      marginBottom: 20,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
    },
    stat: {
      alignItems: 'center',
    },
    statNum: {
      ...ff(800),
      fontSize: 24,
      color: colors.lime,
      letterSpacing: -0.5,
    },
    statLbl: {
      ...ff(400),
      fontSize: 11,
      color: colors.textInverseFaint,
      marginTop: 1,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.overlayGhostBorder,
    },
    // ── Scroll area ──
    scrollContent: {
      padding: spacing.md,
      paddingTop: spacing.sm,
      gap: 0,
      paddingBottom: spacing.xxxl,
    },
    listHint: {
      ...ff(400),
      fontSize: 12,
      marginBottom: 10,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    // ── Seed group card ──
    seedGroup: {
      backgroundColor: colors.cardBg,
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
      marginBottom: 10,
    },
    groupHdr: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
    },
    groupHdrLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    groupIconTile: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupName: {
      ...ff(700),
      fontSize: 11,
      letterSpacing: 1.3,
    },
    groupHdrRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    groupCount: {
      ...ff(400),
      fontSize: 11,
    },
    // ── Category rows ──
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 14,
      gap: 10,
    },
    catDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    },
    catName: {
      ...ff(600),
      fontSize: 14,
      flex: 1,
    },
    targetBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    targetBadgeTxt: {
      ...ff(700),
      fontSize: 10,
    },
    // ── Footer ──
    footerHint: {
      ...ff(400),
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
    },
    startBtn: {
      height: 52,
      borderRadius: radius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 12,
    },
    startTxt: {
      ...ff(700),
      fontSize: 16,
    },
    customiseBtn: {
      height: 48,
      borderRadius: radius.full,
      borderWidth: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    customiseTxt: {
      ...ff(600),
      fontSize: 14,
    },
  });
}
