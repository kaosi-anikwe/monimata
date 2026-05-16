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
 * Verify Reset Code — Step 2 of 3.
 * User enters the one-time code delivered to their email.
 * On success, the server returns a short-lived reset_token used in Step 3.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import client from '@/services/api';
import { AuthHdr, BackBtn, s } from './_authShared';

const schema = z.object({
  code: z
    .string()
    .min(1, 'Enter the code from your email')
    .max(10, 'Code is too long'),
});

type FormValues = z.infer<typeof schema>;

export default function VerifyResetCodeScreen() {
  const colors = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  async function onSubmit(data: FormValues) {
    setError(null);
    setLoading(true);
    try {
      const { data: res, error: apiError } = await client.POST('/auth/verify-reset-code', {
        body: { email: email ?? '', code: data.code },
      });
      if (apiError || !res?.reset_token) {
        setError('Invalid or expired code. Please try again.');
        return;
      }
      router.push({
        pathname: '/(auth)/reset-password',
        params: { reset_token: res.reset_token, email: email },
      });
    } catch {
      setError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || resendLoading) return;
    setResendLoading(true);
    setResendSent(false);
    setError(null);
    try {
      await client.POST('/auth/forgot-password', { body: { email } });
      setResendSent(true);
    } catch {
      setError('Could not resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  }

  const maskedEmail = email
    ? email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
    : 'your email';

  return (
    <View style={[s.screen, { backgroundColor: colors.cardBg }]}>
      <StatusBar style="light" />

      <AuthHdr>
        <BackBtn onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/forgot-password')} />
        <Text style={[s.authTitle, { color: colors.white }]}>Enter your code</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>
          Sent to {maskedEmail}
        </Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={[s.errorBanner, { backgroundColor: colors.errorSubtle }]}>
              <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {resendSent ? (
            <View style={[s.errorBanner, { backgroundColor: colors.surface }]}>
              <Text style={[s.errorText, { color: colors.brand }]}>
                A new code has been sent to your email.
              </Text>
            </View>
          ) : null}

          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Reset Code"
                value={value}
                onChangeText={(v) => onChange(v.trim())}
                onBlur={onBlur}
                placeholder="e.g. 123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                error={errors.code?.message}
              />
            )}
          />

          <Button
            variant="green"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            loading={loading}
            style={{ marginTop: spacing.xxl }}
            accessibilityLabel="Verify reset code"
          >
            Verify Code
          </Button>

          <View style={ls.resendRow}>
            <Text style={[type_.bodyReg, { color: colors.textMeta }]}>
              {"Didn't receive it? "}
            </Text>
            <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
              <Text style={{ ...type_.bodyReg, color: colors.brand }}>
                {resendLoading ? 'Sending…' : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const ls = StyleSheet.create({
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
