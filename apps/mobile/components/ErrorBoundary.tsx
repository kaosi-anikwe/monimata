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
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Text style={s.icon}>⚠️</Text>
      <Text style={[s.title, { color: colors.textPrimary }]}>Something went wrong</Text>
      <Text style={[s.message, { color: colors.textMeta }]} numberOfLines={4}>
        {message}
      </Text>
      <TouchableOpacity style={[s.btn, { backgroundColor: colors.brand }]} onPress={onReset} activeOpacity={0.8}>
        <Text style={[s.btnText, { color: colors.white }]}>Try Again</Text>
      </TouchableOpacity>
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
      console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
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
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: { fontSize: 40, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { fontSize: 15, fontWeight: '700' },
});
