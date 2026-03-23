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
import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { login, clearError } from '@/store/authSlice';

export default function LoginScreen() {
    const dispatch = useAppDispatch();
    const { loading, error } = useAppSelector((s) => s.auth);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    async function handleLogin() {
        dispatch(clearError());
        const result = await dispatch(login({ email: email.trim(), password }));
        if (login.fulfilled.match(result)) {
            const user = result.payload;
            // Route based on onboarding state
            if (!user.identity_verified) {
                router.replace('/(auth)/verify-bvn');
            } else {
                router.replace('/(tabs)');
            }
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
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="emeka@example.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View style={styles.fieldWrapper}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Your password"
                            secureTextEntry
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, loading && styles.btnDisabled]}
                        onPress={handleLogin}
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
                            Don't have an account? <Text style={styles.registerLinkBold}>Sign up</Text>
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
