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
 * Register screen — email, password, first/last name, phone.
 * On success → navigates to BVN verification.
 */
import { z } from 'zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { clearError, register } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { Button, Input } from '@/components/ui';
import { AuthHdr, BackBtn, s } from './_authShared';

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().refine(
    (v) => v === '' || /^(\+?234|0)[789][01]\d{8}$/.test(v),
    { message: 'Enter a valid Nigerian phone number' },
  ),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

type FormValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => s.auth);
  const colors = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '', last_name: '', email: '',
      phone: '', password: '', confirm_password: '',
    },
  });

  async function onSubmit(data: FormValues) {
    dispatch(clearError());
    try {
      await dispatch(
        register({
          email: data.email,
          password: data.password,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone || undefined,
        }),
      ).unwrap();
      router.replace('/(auth)/verify-bvn');
    } catch {
      // error is already written to Redux state by the rejected handler in authSlice
    }
  }

  return (
    <View style={[s.screen, { backgroundColor: colors.white }]}>
      <StatusBar style="light" />
      {/* ── Dark green header ── */}
      <AuthHdr>
        <BackBtn onPress={() => router.back()} />
        <Text style={[s.authTitle, { color: colors.white }]}>Create your account</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>3 quick fields, then you&apos;re in</Text>
      </AuthHdr>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[s.errorBanner, { backgroundColor: colors.errorSubtle }]}>
              <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Controller
                control={control}
                name="first_name"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="First Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Emeka"
                    error={errors.first_name?.message}
                    containerStyle={{ flex: 1 }}
                  />
                )}
              />
              <Controller
                control={control}
                name="last_name"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Last Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Okafor"
                    error={errors.last_name?.message}
                    containerStyle={{ flex: 1 }}
                  />
                )}
              />
            </View>

            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="Email Address"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="emeka@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="Phone (optional)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="08012345678"
                  keyboardType="phone-pad"
                  error={errors.phone?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label="Password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Min. 8 characters"
                  secureTextEntry
                  error={errors.password?.message}
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
                  placeholder="Repeat password"
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
            style={{ marginTop: 8 }}
            accessibilityLabel="Create account"
          >
            Create Account
          </Button>

          <View style={s.tosWrap}>
            <Text style={[s.tosText, { color: colors.textMeta }]}>
              By creating an account, you agree to our{' '}
              <Text style={[s.tosLink, { color: colors.textSecondary }]}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={[s.tosLink, { color: colors.textSecondary }]}>Privacy Policy</Text>.
            </Text>
          </View>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={s.navLink}>
            <Text style={[s.navLinkText, { color: colors.textMeta }]}>
              Already have an account?{' '}
              <Text style={{ color: colors.brand, ...ff(700) }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
