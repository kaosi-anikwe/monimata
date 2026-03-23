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
 * Register screen — email, password, first/last name.
 * On success → navigates to BVN verification.
 */
import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { register, clearError } from '@/store/authSlice';

export default function RegisterScreen() {
    const dispatch = useAppDispatch();
    const { loading, error } = useAppSelector((s) => s.auth);

    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
    });
    const [localError, setLocalError] = useState('');

    const set = (field: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [field]: value }));

    async function handleRegister() {
        setLocalError('');
        dispatch(clearError());

        if (form.password !== form.confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }
        if (form.password.length < 8) {
            setLocalError('Password must be at least 8 characters');
            return;
        }

        const result = await dispatch(
            register({
                email: form.email.trim(),
                password: form.password,
                first_name: form.first_name.trim() || undefined,
                last_name: form.last_name.trim() || undefined,
                phone: form.phone.trim() || undefined,
            }),
        );

        if (register.fulfilled.match(result)) {
            router.replace('/(auth)/verify-bvn');
        }
    }

    const displayError = localError || error;

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
                    <Text style={styles.sub}>It's free. No credit card needed.</Text>

                    {displayError ? <Text style={styles.errorBanner}>{displayError}</Text> : null}

                    <View style={styles.row}>
                        <Field
                            label="First name"
                            value={form.first_name}
                            onChangeText={set('first_name')}
                            placeholder="Emeka"
                            style={{ flex: 1 }}
                        />
                        <Field
                            label="Last name"
                            value={form.last_name}
                            onChangeText={set('last_name')}
                            placeholder="Okafor"
                            style={{ flex: 1 }}
                        />
                    </View>

                    <Field
                        label="Email address"
                        value={form.email}
                        onChangeText={set('email')}
                        placeholder="emeka@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Field
                        label="Phone (optional)"
                        value={form.phone}
                        onChangeText={set('phone')}
                        placeholder="+234 801 234 5678"
                        keyboardType="phone-pad"
                    />

                    <Field
                        label="Password"
                        value={form.password}
                        onChangeText={set('password')}
                        placeholder="Min. 8 characters"
                        secureTextEntry
                    />

                    <Field
                        label="Confirm password"
                        value={form.confirmPassword}
                        onChangeText={set('confirmPassword')}
                        placeholder="Repeat password"
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.btn, loading && styles.btnDisabled]}
                        onPress={handleRegister}
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
    label, style, ...props
}: React.ComponentProps<typeof TextInput> & { label: string; style?: object }) {
    return (
        <View style={[styles.fieldWrapper, style]}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} placeholderTextColor="#9CA3AF" {...props} />
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
