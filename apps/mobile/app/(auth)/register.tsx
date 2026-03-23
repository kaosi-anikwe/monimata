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
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { register, clearError } from '@/store/authSlice';

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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>It&apos;s free. No credit card needed.</Text>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <View style={styles.row}>
            <Controller
              control={control}
              name="first_name"
              render={({ field: { value, onChange, onBlur } }) => (
                <Field label="First name" value={value} onChangeText={onChange} onBlur={onBlur}
                  placeholder="Emeka" error={errors.first_name?.message} style={{ flex: 1 }} />
              )}
            />
            <Controller
              control={control}
              name="last_name"
              render={({ field: { value, onChange, onBlur } }) => (
                <Field label="Last name" value={value} onChangeText={onChange} onBlur={onBlur}
                  placeholder="Okafor" error={errors.last_name?.message} style={{ flex: 1 }} />
              )}
            />
          </View>

          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Email address" value={value} onChangeText={onChange} onBlur={onBlur}
                placeholder="emeka@example.com" keyboardType="email-address" autoCapitalize="none"
                error={errors.email?.message} />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Phone (optional)" value={value} onChangeText={onChange} onBlur={onBlur}
                placeholder="08012345678" keyboardType="phone-pad"
                error={errors.phone?.message} />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Password" value={value} onChangeText={onChange} onBlur={onBlur}
                placeholder="Min. 8 characters" secureTextEntry
                error={errors.password?.message} />
            )}
          />

          <Controller
            control={control}
            name="confirm_password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Confirm password" value={value} onChangeText={onChange} onBlur={onBlur}
                placeholder="Repeat password" secureTextEntry
                error={errors.confirm_password?.message} />
            )}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, error, style, ...props
}: React.ComponentProps<typeof TextInput> & { label: string; error?: string; style?: object }) {
  return (
    <View style={[styles.fieldWrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingBottom: 48 },
  back: { marginBottom: 24 },
  backText: { color: '#0F7B3F', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  fieldWrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  inputError: { borderColor: '#DC2626' },
  fieldError: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginLink: { marginTop: 20, alignItems: 'center' },
  loginLinkText: { color: '#6B7280', fontSize: 14 },
  loginLinkBold: { color: '#0F7B3F', fontWeight: '700' },
});
