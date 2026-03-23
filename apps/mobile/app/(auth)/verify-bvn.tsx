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
 * BVN Verification screen — required before linking any bank account.
 * Calls POST /auth/verify-bvn with the user's 11-digit BVN.
 * On success → navigates to Link Bank Account screen.
 */
import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { verifyBVN, clearError } from '@/store/authSlice';

export default function VerifyBVNScreen() {
    const dispatch = useAppDispatch();
    const { loading, error, user } = useAppSelector((s) => s.auth);

    const [bvn, setBvn] = useState('');

    async function handleVerify() {
        dispatch(clearError());
        const result = await dispatch(verifyBVN(bvn.trim()));
        if (verifyBVN.fulfilled.match(result)) {
            router.replace('/(auth)/link-bank');
        }
    }

    // If user already verified, skip straight to link-bank
    if (user?.identity_verified) {
        router.replace('/(auth)/link-bank');
        return null;
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.iconWrap}>
                    <Text style={styles.icon}>🔐</Text>
                </View>

                <Text style={styles.title}>Verify your identity</Text>
                <Text style={styles.body}>
                    Nigerian regulations require identity verification before linking a bank account.
                    Enter your 11-digit BVN to continue. Your BVN is never stored — only your name is
                    checked against your registration.
                </Text>

                {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

                <Text style={styles.label}>Bank Verification Number (BVN)</Text>
                <TextInput
                    style={styles.input}
                    value={bvn}
                    onChangeText={(t) => setBvn(t.replace(/\D/g, '').slice(0, 11))}
                    placeholder="e.g. 12345678901"
                    keyboardType="numeric"
                    maxLength={11}
                    placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.hint}>
                    {bvn.length}/11 digits — Dial *565*0# on any network to retrieve your BVN
                </Text>

                <TouchableOpacity
                    style={[styles.btn, (loading || bvn.length !== 11) && styles.btnDisabled]}
                    onPress={handleVerify}
                    disabled={loading || bvn.length !== 11}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.btnText}>Verify Identity</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.skipLink}>
                    <Text style={styles.skipText}>Skip for now (limited features)</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1, padding: 24, paddingTop: 48 },
    iconWrap: { alignItems: 'center', marginBottom: 24 },
    icon: { fontSize: 56 },
    title: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
    body: {
        fontSize: 14, color: '#6B7280', lineHeight: 22,
        textAlign: 'center', marginBottom: 32,
    },
    errorBanner: {
        backgroundColor: '#FEE2E2', color: '#DC2626',
        padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 14,
    },
    label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
    input: {
        borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 13, fontSize: 18,
        color: '#111827', backgroundColor: '#F9FAFB', letterSpacing: 4,
        textAlign: 'center',
    },
    hint: { fontSize: 12, color: '#9CA3AF', marginTop: 8, marginBottom: 32, textAlign: 'center' },
    btn: {
        backgroundColor: '#0F7B3F', borderRadius: 14,
        paddingVertical: 16, alignItems: 'center',
    },
    btnDisabled: { opacity: 0.4 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    skipLink: { marginTop: 20, alignItems: 'center' },
    skipText: { color: '#9CA3AF', fontSize: 13 },
});
