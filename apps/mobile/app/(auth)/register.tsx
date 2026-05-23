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
 * On success → navigates to onboarding questionnaire.
 */
import { register } from '@/store/authSlice';
import { useAppDispatch } from '@/store/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import consoleClient from '@/services/consoleApi';
import { AuthHdr, BackBtn, s } from './_authShared';

const USERNAME_RE = /^[a-z0-9_-]+$/;

const schema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(USERNAME_RE, 'Only lowercase letters, digits, hyphens, and underscores'),
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

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function RegisterScreen() {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colors = useTheme();

  // ── Username availability ─────────────────────────────────────────────
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function checkUsername(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 3 || !USERNAME_RE.test(value) || value.length > 30) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await consoleClient.GET<{ available: boolean }>('/auth/check-username', {
          params: { query: { username: value } },
        });
        setUsernameStatus(data?.['available'] ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const {
    control,
    handleSubmit,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      username: '', first_name: '', last_name: '', email: '',
      phone: '', password: '', confirm_password: '',
    },
  });

  // Show constraint message in neutral while untouched; switch to red on blur with invalid input.
  const revealed = (name: keyof FormValues) => touchedFields[name] || isSubmitted;
  function fieldError(name: keyof FormValues) {
    return revealed(name) ? errors[name]?.message : undefined;
  }
  function fieldHint(name: keyof FormValues) {
    return !revealed(name) ? errors[name]?.message : undefined;
  }

  async function onSubmit(data: FormValues) {
    if (usernameStatus === 'idle') {
      // Username was never checked (e.g. auto-filled without triggering onChange).
      // Kick off the check so the next tap will have a result.
      checkUsername(data.username);
      setError('Checking username availability — please try again in a moment');
      return;
    }
    if (usernameStatus === 'checking') {
      setError('Still checking username availability — please try again in a moment');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken — choose a different one above');
      return;
    }
    if (usernameStatus === 'invalid') {
      setError('Username is invalid — fix it above before continuing');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await dispatch(
        register({
          email: data.email,
          password: data.password,
          username: data.username,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone || undefined,
        }),
      ).unwrap();
      router.replace('/(auth)/onboarding');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.screen, { backgroundColor: colors.cardBg }]}>
      <StatusBar style="light" />
      {/* ── Dark green header ── */}
      <AuthHdr>
        <BackBtn onPress={() => router.back()} />
        <Text style={[s.authTitle, { color: colors.white }]}>Create your account</Text>
        <Text style={[s.authSub, { color: colors.textInverseSecondary }]}>4 quick fields, then you&apos;re in</Text>
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

          <View style={{ gap: spacing.mdn }}>
            <Controller
              control={control}
              name="username"
              render={({ field: { value, onChange, onBlur } }) => {
                const hint =
                  usernameStatus === 'checking' ? null
                    : usernameStatus === 'available' ? 'Username is available'
                      : usernameStatus === 'taken' ? 'Username is already taken'
                        : undefined;
                const hintColor =
                  usernameStatus === 'available' ? colors.brand : colors.error;
                return (
                  <View>
                    <Input
                      label="Username"
                      value={value}
                      onChangeText={(v) => { const cleaned = v.toLowerCase().trim(); onChange(cleaned); checkUsername(cleaned); }}
                      onBlur={() => { onBlur(); checkUsername(value); }}
                      placeholder="e.g. emeka_okafor"
                      autoCapitalize="none"
                      autoCorrect={false}
                      error={fieldError('username')}
                      hint={fieldHint('username')}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, minHeight: 16, gap: spacing.xs }}>
                      {usernameStatus === 'checking' && (
                        <ActivityIndicator size="small" color={colors.textMeta} />
                      )}
                      {hint && (
                        <Text style={[type_.small, { color: hintColor }]}>{hint}</Text>
                      )}
                    </View>
                  </View>
                );
              }}
            />

            <View style={{ flexDirection: 'row', gap: spacing.smd }}>
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
                    error={fieldError('first_name')}
                    hint={fieldHint('first_name')}
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
                    error={fieldError('last_name')}
                    hint={fieldHint('last_name')}
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
                  error={fieldError('email')}
                  hint={fieldHint('email')}
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
                  error={fieldError('phone')}
                  hint={fieldHint('phone')}
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
                  error={fieldError('password')}
                  hint={fieldHint('password')}
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
                  error={fieldError('confirm_password')}
                  hint={fieldHint('confirm_password')}
                />
              )}
            />
          </View>

          <Button
            variant="green"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            loading={loading}
            style={{ marginTop: spacing.sm }}
            accessibilityLabel="Create account"
          >
            Create Account
          </Button>

          <View style={s.tosWrap}>
            <Text style={[s.tosText, { color: colors.textMeta }]}>
              By creating an account, you agree to our{' '}
              <Text style={[s.tosLink, { color: colors.textSecondary }]} onPress={() => Linking.openURL('https://monimata.ng/terms-of-service')}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={[s.tosLink, { color: colors.textSecondary }]} onPress={() => Linking.openURL('https://monimata.ng/privacy-policy')}>Privacy Policy</Text>.
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
