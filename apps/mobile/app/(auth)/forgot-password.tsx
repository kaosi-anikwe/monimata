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
 * Forgot Password — Step 1 of 3.
 * User enters their email address; we send them a one-time reset code.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
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

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const colors = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(data: FormValues) {
    setError(null);
    setLoading(true);
    try {
      const { error: apiError } = await consoleClient.POST('/auth/forgot-password', {
        body: { email: data.email },
      });
      if (apiError) {
        setError('Something went wrong. Please try again.');
        return;
      }
      router.push({
        pathname: '/(auth)/verify-reset-code',
        params: { email: data.email },
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
        <BackBtn onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/login')} />
        <Text style={[s.authTitle, { color: colors.white }]}>Forgot password?</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>
          We&apos;ll send a reset code to your email
        </Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TrustCard
            text="Enter the email address linked to your account. If it exists, you'll receive a one-time code within a few minutes."
            colors={colors}
          />

          {error ? (
            <View style={[s.errorBanner, { backgroundColor: colors.errorSubtle }]}>
              <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Email Address"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="adaeze@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={errors.email?.message}
              />
            )}
          />

          <Button
            variant="green"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            loading={loading}
            style={{ marginTop: spacing.xxl }}
            accessibilityLabel="Send reset code"
          >
            Send Reset Code
          </Button>

          <Text style={[s.navLinkText, { color: colors.textMeta, textAlign: 'center', marginTop: spacing.xl }]}>
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
