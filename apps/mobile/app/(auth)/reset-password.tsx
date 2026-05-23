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
 * Reset Password — Step 3 of 3.
 * User sets a new password using the short-lived reset_token from Step 2.
 * On success, redirects to login with the email pre-filled.
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
  Text,
  View,
} from 'react-native';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';
import consoleClient from '@/services/consoleApi';
import { AuthHdr, BackBtn, TrustCard, s } from './_authShared';

const schema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordScreen() {
  const colors = useTheme();
  const { reset_token, email } = useLocalSearchParams<{
    reset_token: string;
    email?: string;
  }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  async function onSubmit(data: FormValues) {
    if (!reset_token) {
      setError('Reset token is missing. Please restart the password reset flow.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: apiError } = await consoleClient.POST('/auth/reset-password', {
        body: { reset_token, new_password: data.new_password },
      });
      if (apiError) {
        setError('Your reset link has expired. Please request a new one.');
        return;
      }
      // Navigate to login, pre-filling the email so the user can sign in immediately.
      router.replace({
        pathname: '/(auth)/login',
        params: email ? { prefillEmail: email } : {},
      });
    } catch {
      setError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.screen, { backgroundColor: colors.cardBg }]}>
      <StatusBar style="light" />

      <AuthHdr>
        <BackBtn onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/forgot-password')} />
        <Text style={[s.authTitle, { color: colors.white }]}>New password</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>
          Choose something strong and memorable
        </Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TrustCard
            text="Use at least 8 characters. Mix letters, numbers, and symbols for a stronger password."
            colors={colors}
          />

          {error ? (
            <View style={[s.errorBanner, { backgroundColor: colors.errorSubtle }]}>
              <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={{ gap: spacing.mdn }}>
            <Controller
              control={control}
              name="new_password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="New Password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoComplete="new-password"
                  error={errors.new_password?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="confirm_password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="Confirm Password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Repeat your new password"
                  secureTextEntry
                  error={errors.confirm_password?.message}
                />
              )}
            />
          </View>

          <Button
            variant="green"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            loading={loading}
            style={{ marginTop: spacing.xxl }}
            accessibilityLabel="Set new password"
          >
            Set New Password
          </Button>

          <Text
            style={[s.navLinkText, { color: colors.textMeta, textAlign: 'center', marginTop: spacing.xl }]}
          >
            {'Remember your password? '}
            <Text
              style={{ color: colors.brand, ...ff(700) }}
              onPress={() => router.replace('/(auth)/login')}
            >
              Log in
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
