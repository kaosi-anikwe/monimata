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
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';

import { useTheme } from '@/lib/theme';
import { ff } from '@/lib/typography';
import { clearError, login } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { AuthHdr, AuthInput, BackBtn, EyeIcon, s } from './_authShared';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((st) => st.auth);
  const colors = useTheme();
  const [showPw, setShowPw] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
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
    <View style={[s.screen, { backgroundColor: colors.white }]}>
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

          {/* Email */}
          <View style={s.field}>
            <Text style={[s.fieldLbl, { color: colors.textSecondary }]}>Email Address</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <AuthInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="adaeze@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  hasError={!!errors.email}
                  colors={colors}
                />
              )}
            />
            {errors.email ? <Text style={[s.fieldErr, { color: colors.error }]}>{errors.email.message}</Text> : null}
          </View>

          {/* Password */}
          <View style={s.field}>
            <Text style={[s.fieldLbl, { color: colors.textSecondary }]}>Password</Text>
            <View style={s.pwWrap}>
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <AuthInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Your password"
                    secureTextEntry={!showPw}
                    hasError={!!errors.password}
                    colors={colors}
                  />
                )}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw((v) => !v)}>
                <EyeIcon open={showPw} color={colors.textMeta} />
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={[s.fieldErr, { color: colors.error }]}>{errors.password.message}</Text> : null}
            {/* Forgot password */}
            <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 6 }}>
              <Text style={[s.forgot, { color: colors.textMeta }]}>
                Forgot password?{' '}
                <Text style={{ color: colors.brand, ...ff(600) }}>Reset</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.btnGreen, { backgroundColor: colors.brand }, loading && s.btnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Log in to your account"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={[s.btnText, { color: colors.white }]}>Log In</Text>}
          </TouchableOpacity>

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
