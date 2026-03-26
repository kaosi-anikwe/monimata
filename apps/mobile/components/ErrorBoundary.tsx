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

import * as Sentry from '@sentry/react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';

interface Props {
  children: React.ReactNode;
  /** Called after the user taps "Try Again" — use to reset external state if needed. */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Functional fallback UI so we can use useTheme() for dark mode support.
function ErrorFallback({ message, onReset }: { message: string; onReset: () => void }) {
  const colors = useTheme();
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Dark-green header band — matches ScreenHeader / profile header */}
      <View style={[s.header, { backgroundColor: colors.darkGreen }]}>
        <View style={[s.iconBubble, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
          <Text style={s.iconText}>⚠️</Text>
        </View>
        <Text style={[s.heading, { color: colors.white, ...ff(800) }]}>
          Something went wrong
        </Text>
        <Text style={[s.sub, { color: colors.textInverseFaint, ...ff(400) }]}>
          MoniMata hit an unexpected error
        </Text>
      </View>

      {/* Body card */}
      <View style={s.body}>
        <View style={[s.card, { backgroundColor: colors.white, borderColor: colors.border }, shadow.sm]}>
          <Text style={[s.errorLabel, { color: colors.textMeta, ...ff(600) }]}>Error details</Text>
          <Text style={[s.errorMsg, { color: colors.textPrimary, ...ff(400) }]} numberOfLines={5}>
            {message}
          </Text>
        </View>

        <TouchableOpacity
          style={[s.btn, { backgroundColor: colors.lime }]}
          onPress={onReset}
          activeOpacity={0.82}
        >
          <Text style={[s.btnText, { color: colors.darkGreen, ...ff(700) }]}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * React class-based error boundary.
 *
 * Wrap individual screens so a crash in one tab cannot take down the entire app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyScreen />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Forward to Sentry for production crash tracking.
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    if (__DEV__) {
      console.error('[ErrorBoundary] Rendering fallback for error:', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.error?.message ?? 'An unexpected error occurred.'}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Dark-green header — mirrors ScreenHeader / profile header
  header: {
    paddingTop: 80,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  iconBubble: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconText: { fontSize: 28, lineHeight: 34 },
  heading: { fontSize: 22, letterSpacing: -0.3, textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center' },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.smd,
  },
  errorLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  errorMsg: { fontSize: 13, lineHeight: 20 },

  // CTA button — lime/dark-green, matches primary buttons
  btn: {
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { fontSize: 15 },
});
