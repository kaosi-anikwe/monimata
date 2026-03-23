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
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { z } from 'zod';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafeAreaView } from 'react-native-safe-area-context';

import { login, clearError } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => s.auth);

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
      if (!user.identity_verified) {
        router.replace('/(auth)/verify-bvn');
      } else {
        router.replace('/(tabs)');
      }
    } catch {
      // error is already written to Redux state by the rejected handler in authSlice
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Log in to your MoniMata account</Text>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Email address</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  style={[styles.input, errors.email ? styles.inputError : null]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="emeka@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9CA3AF"
                />
              )}
            />
            {errors.email ? <Text style={styles.fieldError}>{errors.email.message}</Text> : null}
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Password</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  style={[styles.input, errors.password ? styles.inputError : null]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Your password"
                  secureTextEntry
                  placeholderTextColor="#9CA3AF"
                />
              )}
            />
            {errors.password ? <Text style={styles.fieldError}>{errors.password.message}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/register')} style={styles.registerLink}>
            <Text style={styles.registerLinkText}>
              Don&apos;t have an account? <Text style={styles.registerLinkBold}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24 },
  back: { marginBottom: 32 },
  backText: { color: '#0F7B3F', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 32 },
  errorBanner: {
    backgroundColor: '#FEE2E2', color: '#DC2626',
    padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 14,
  },
  fieldWrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15,
    color: '#111827', backgroundColor: '#F9FAFB',
  },
  inputError: { borderColor: '#DC2626' },
  fieldError: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: '#0F7B3F', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerLink: { marginTop: 20, alignItems: 'center' },
  registerLinkText: { color: '#6B7280', fontSize: 14 },
  registerLinkBold: { color: '#0F7B3F', fontWeight: '700' },
});
