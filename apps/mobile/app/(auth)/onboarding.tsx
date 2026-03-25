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
 * Onboarding Questionnaire — shown once after BVN verification.
 *
 * 3-step flow: income type → housing situation → financial goal.
 * Answers are collected into `OnboardingAnswers` and forwarded (as
 * JSON-encoded route params) to the Budget Seed screen.
 *
 * Phase 16 integration note:
 *   Replace `proceedToBudgetSeed()` with an API call:
 *     POST /users/onboarding  { income_type, housing, goal }
 *   The server returns seeded category groups for the budget-seed preview.
 *   Show an ActivityIndicator while the request is in flight.
 *   On success pass the server-returned seed groups as params to budget-seed.
 *   On error show a toast and let the user retry or skip.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The payload that will be POSTed to POST /users/onboarding in Phase 16.
 * null means the user skipped that question.
 */
export type OnboardingAnswers = {
  incomeType: 'employed' | 'freelancer' | 'business' | 'student' | null;
  housing: 'renting' | 'family' | 'mortgage' | 'shared' | null;
  goal: 'cashflow' | 'specific_goal' | 'debt' | 'track' | null;
};

type AnswerKey = keyof OnboardingAnswers;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface StepOption {
  key: string;
  label: string;
  sublabel: string;
  icon: IoniconName;
}

interface StepConfig {
  field: AnswerKey;
  question: string;
  sub: string;
  meta: string;
  options: StepOption[];
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS: StepConfig[] = [
  {
    field: 'incomeType',
    question: 'How do you primarily earn money?',
    sub: "We'll set up budget categories that actually fit your life",
    meta: 'Step 1 of 3 · Takes about 90 seconds',
    options: [
      {
        key: 'employed',
        label: 'Employed (salary)',
        sublabel: 'Regular monthly pay — GTBank, OPay, Kuda',
        icon: 'briefcase-outline',
      },
      {
        key: 'freelancer',
        label: 'Self-employed / Freelancer',
        sublabel: 'Variable income, client payments',
        icon: 'laptop-outline',
      },
      {
        key: 'business',
        label: 'Business Owner',
        sublabel: 'Running my own shop or company',
        icon: 'storefront-outline',
      },
      {
        key: 'student',
        label: 'Student',
        sublabel: 'Stipend, allowance, or part-time income',
        icon: 'school-outline',
      },
    ],
  },
  {
    field: 'housing',
    question: "What's your housing situation?",
    sub: 'This helps us seed the right housing categories',
    meta: 'Step 2 of 3',
    options: [
      {
        key: 'renting',
        label: 'Renting independently',
        sublabel: 'Rent, NEPA, service charge',
        icon: 'home-outline',
      },
      {
        key: 'family',
        label: 'Living with family / no rent',
        sublabel: 'Household contribution, shared costs',
        icon: 'people-outline',
      },
      {
        key: 'mortgage',
        label: 'Paying a mortgage',
        sublabel: 'Monthly repayment + maintenance',
        icon: 'business-outline',
      },
      {
        key: 'shared',
        label: 'Shared accommodation',
        sublabel: 'Split rent with housemates',
        icon: 'person-add-outline',
      },
    ],
  },
  {
    field: 'goal',
    question: "What's your main financial goal right now?",
    sub: "We'll prioritise the right categories for you",
    meta: 'Step 3 of 3 · Last one!',
    options: [
      {
        key: 'cashflow',
        label: 'Stop living paycheck to paycheck',
        sublabel: 'Emergency fund + savings priority',
        icon: 'wallet-outline',
      },
      {
        key: 'specific_goal',
        label: 'Save for a specific goal',
        sublabel: 'House, car, travel, or gadget',
        icon: 'flag-outline',
      },
      {
        key: 'debt',
        label: 'Pay off debt',
        sublabel: 'Loans, credit cards, family debts',
        icon: 'trending-down-outline',
      },
      {
        key: 'track',
        label: 'Just track my money',
        sublabel: "See where it's going first",
        icon: 'bar-chart-outline',
      },
    ],
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    incomeType: null,
    housing: null,
    goal: null,
  });

  const current = STEPS[stepIndex];
  const selected = answers[current.field];
  const isLast = stepIndex === STEPS.length - 1;

  function selectOption(key: string) {
    setAnswers((prev) => ({ ...prev, [current.field]: key }));
  }

  function handleContinue() {
    if (isLast) {
      proceedToBudgetSeed(answers);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleSkip() {
    const skippedAnswers = { ...answers, [current.field]: null } as OnboardingAnswers;
    setAnswers(skippedAnswers);
    if (isLast) {
      proceedToBudgetSeed(skippedAnswers);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function proceedToBudgetSeed(finalAnswers: OnboardingAnswers) {
    // Phase 16: replace with POST /users/onboarding before navigating.
    // The response body contains seeded category groups for the preview.
    router.push({
      pathname: '/(auth)/budget-seed',
      params: { answers: JSON.stringify(finalAnswers) },
    } as never);
  }

  return (
    <View style={ss.screen}>
      <StatusBar style="light" />

      {/* ── Dark-green gradient header ── */}
      <LinearGradient
        colors={[colors.darkGreen, colors.darkGreenMid]}
        style={[ss.header, { paddingTop: insets.top + 14 }]}
      >
        {/* 3-pill progress bar */}
        <View style={ss.stepDots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                ss.stepDot,
                {
                  backgroundColor:
                    i < stepIndex
                      ? colors.brand
                      : i === stepIndex
                        ? colors.lime
                        : colors.overlayGhost,
                },
              ]}
            />
          ))}
        </View>

        <Text style={ss.stepMeta}>{current.meta}</Text>
        <Text style={ss.question}>{current.question}</Text>
        <Text style={ss.headerSub}>{current.sub}</Text>
      </LinearGradient>

      {/* ── Scrollable options ── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {current.options.map((opt) => {
          const isSelected = selected === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                ss.option,
                {
                  borderColor: isSelected ? colors.brand : colors.border,
                  backgroundColor: isSelected ? colors.surface : colors.white,
                },
              ]}
              onPress={() => selectOption(opt.key)}
              activeOpacity={0.75}
            >
              {/* Ionicons tile */}
              <View
                style={[
                  ss.optIcon,
                  {
                    backgroundColor: isSelected ? colors.surfaceElevated : colors.surfaceHigh,
                  },
                ]}
              >
                <Ionicons
                  name={opt.icon}
                  size={22}
                  color={isSelected ? colors.brand : colors.textSecondary}
                />
              </View>

              {/* Text block */}
              <View style={ss.optText}>
                <Text style={[ss.optName, { color: colors.textPrimary }]}>{opt.label}</Text>
                <Text style={[ss.optSub, { color: colors.textMeta }]}>{opt.sublabel}</Text>
              </View>

              {/* Checkbox */}
              <View
                style={[
                  ss.checkBox,
                  {
                    borderColor: isSelected ? colors.brand : colors.borderStrong,
                    backgroundColor: isSelected ? colors.brand : 'transparent',
                  },
                ]}
              >
                {isSelected && <Ionicons name="checkmark" size={13} color={colors.white} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Live-preview hint — animates in once user taps an option */}
        {selected ? (
          <View
            style={[
              ss.livePreview,
              { backgroundColor: colors.surface, borderColor: colors.borderBrand },
            ]}
          >
            <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
            <Text style={[ss.previewTxt, { color: colors.textSecondary }]}>
              We&apos;re adding categories to match your situation…
            </Text>
          </View>
        ) : null}

        {/* Privacy reassurance */}
        <Text style={[ss.reassure, { color: colors.textTertiary }]}>
          Your answers are private and can be changed anytime in settings
        </Text>

        {/* Continue CTA */}
        <TouchableOpacity
          style={[
            ss.continueBtn,
            {
              backgroundColor: isLast ? colors.lime : colors.brand,
              opacity: selected ? 1 : 0.4,
            },
          ]}
          onPress={handleContinue}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={[ss.continueTxt, { color: isLast ? colors.darkGreen : colors.white }]}>
            {isLast ? 'See My Budget Preview ✨' : 'Continue'}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity onPress={handleSkip} style={ss.skipWrap}>
          <Text style={[ss.skipTxt, { color: colors.textTertiary }]}>Skip this question</Text>
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
      backgroundColor: colors.darkGreen,
    },
    // ── Header ──
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    stepDots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    stepDot: {
      flex: 1,
      height: 6,
      borderRadius: 3,
    },
    stepMeta: {
      ...ff(400),
      fontSize: 11,
      color: colors.textInverseFaint,
      marginBottom: 10,
    },
    question: {
      ...ff(800),
      fontSize: 20,
      color: colors.white,
      letterSpacing: -0.3,
      lineHeight: 26,
      marginBottom: 6,
    },
    headerSub: {
      ...ff(400),
      fontSize: 13,
      color: colors.textInverseSecondary,
    },
    // ── Options ──
    scrollContent: {
      padding: spacing.lg,
      paddingTop: spacing.md,
      gap: 9,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1.5,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    optIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    optText: {
      flex: 1,
    },
    optName: {
      ...ff(700),
      fontSize: 14,
    },
    optSub: {
      ...ff(400),
      fontSize: 12,
      marginTop: 2,
    },
    checkBox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 2,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // ── Preview hint + reassurance ──
    livePreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      marginTop: spacing.xs,
    },
    previewTxt: {
      ...ff(400),
      fontSize: 13,
      flex: 1,
    },
    reassure: {
      ...ff(400),
      fontSize: 11,
      textAlign: 'center',
      paddingVertical: spacing.xs,
    },
    // ── CTAs ──
    continueBtn: {
      height: 50,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    continueTxt: {
      ...ff(700),
      fontSize: 15,
    },
    skipWrap: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
    },
    skipTxt: {
      ...ff(400),
      fontSize: 13,
      textDecorationLine: 'underline',
    },
  });
}
