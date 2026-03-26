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
 * Login screen.
 */
import { z } from 'zod';
import { StatusBar } from 'expo-status-bar';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { router, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { ff } from '@/lib/typography';
import { Button, Input } from '@/components/ui';
import { AuthHdr, BackBtn, s } from './_authShared';
import { clearError, login } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((st) => st.auth);
  const colors = useTheme();
  const { prefillEmail } = useLocalSearchParams<{ prefillEmail?: string }>();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefillEmail ?? '', password: '' },
  });

  async function onSubmit(data: FormValues) {
    dispatch(clearError());
    try {
      const user = await dispatch(login({ email: data.email, password: data.password })).unwrap();
      if (user.onboarded) {
        // Root navigator detects isAuthenticated && onboarded=true and
        // automatically transitions to (tabs) — no explicit navigation needed.
        return;
      }
      // Non-onboarded: stay in auth stack and lead user through the setup flow.
      if (!user.identity_verified) {
        router.replace('/(auth)/verify-bvn');
      } else {
        router.replace('/(auth)/onboarding');
      }
    } catch {
      // error is already written to Redux state by the rejected handler in authSlice
    }
  }

  return (
    <View style={[s.screen, { backgroundColor: colors.cardBg }]}>
      <StatusBar style="light" />
      {/* ── Dark green curved header ── */}
      <AuthHdr>
        <BackBtn onPress={() => router.back()} />
        <Text style={[s.authTitle, { color: colors.white }]}>Welcome back</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>Sign in to continue</Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? (
            <View style={[s.errorBanner, { backgroundColor: colors.errorSubtle }]}>
              <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={{ gap: 14 }}>
            {/* Email */}
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
                  error={errors.email?.message}
                />
              )}
            />

            {/* Password */}
            <View>
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Your password"
                    secureTextEntry
                    error={errors.password?.message}
                  />
                )}
              />
              {/* Forgot password */}
              <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 6 }}>
                <Text style={[s.forgot, { color: colors.textMeta }]}>
                  Forgot password?{' '}
                  <Text style={{ color: colors.brand, ...ff(600) }}>Reset</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit */}
          <Button
            variant="green"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            loading={loading}
            style={{ marginTop: 8 }}
            accessibilityLabel="Log in to your account"
          >
            Log In
          </Button>

          {/* Sign-up link */}
          <TouchableOpacity onPress={() => router.replace('/(auth)/register')} style={s.navLink}>
            <Text style={[s.navLinkText, { color: colors.textMeta }]}>
              {`Don't have an account? `}
              <Text style={{ color: colors.brand, ...ff(700) }}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
