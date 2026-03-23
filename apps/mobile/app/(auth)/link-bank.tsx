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
 * Link Bank Account screen — opens Mono Connect SDK webview.
 * On success, exchanges the auth_code for a linked bank account.
 */
import { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';

export default function LinkBankScreen() {
    const [connecting, setConnecting] = useState(false);

    const connectMutation = useMutation({
        mutationFn: (code: string) => api.post('/accounts/connect', { code }).then((r) => r.data),
        onSuccess: () => {
            Alert.alert(
                'Bank linked! 🎉',
                'We are now fetching your transaction history. This may take a minute.',
                [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
            );
        },
        onError: (err: any) => {
            Alert.alert('Could not link account', err?.response?.data?.detail ?? 'Please try again.');
            setConnecting(false);
        },
    });

    function handleOpenMonoConnect() {
        setConnecting(true);
        /**
         * In production this uses the Mono Connect React Native SDK:
         *   import MonoConnect from '@mono.co/connect-react-native';
         *
         * For now we show a placeholder. Replace the block below with the
         * actual SDK integration once the package is installed.
         *
         * const connect = new MonoConnect({ key: MONO_PUBLIC_KEY, onSuccess: ({ code }) => { ... } });
         * connect.setup(); connect.open();
         */
        Alert.alert(
            'Mono Connect',
            '[SDK placeholder]\n\nIn production the Mono Connect SDK webview opens here. ' +
            'After the user links their bank, Mono returns a one-time auth_code which is ' +
            'sent to POST /accounts/connect.',
            [
                { text: 'Cancel', onPress: () => setConnecting(false), style: 'cancel' },
                {
                    text: 'Simulate Success',
                    onPress: () => {
                        // Use a realistic-looking placeholder code for development
                        connectMutation.mutate('test_auth_code_replace_with_real_sdk');
                    },
                },
            ],
        );
    }

    function handleSkip() {
        router.replace('/(tabs)');
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                <View style={styles.hero}>
                    <Text style={styles.icon}>🏦</Text>
                    <Text style={styles.title}>Link your bank account</Text>
                    <Text style={styles.body}>
                        Connect your GTBank, Kuda, Zenith, OPay or any Nigerian bank account. MoniMata
                        will automatically import your transactions every day.
                    </Text>
                    <Text style={styles.security}>
                        🔒 Powered by Mono. Your bank credentials go directly to Mono — MoniMata never
                        sees them.
                    </Text>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.btn, (connecting || connectMutation.isPending) && styles.btnDisabled]}
                        onPress={handleOpenMonoConnect}
                        disabled={connecting || connectMutation.isPending}
                    >
                        {connecting || connectMutation.isPending ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>Connect Bank Account</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleSkip} style={styles.skipLink}>
                        <Text style={styles.skipText}>I'll do this later</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1, padding: 24, justifyContent: 'space-between' },
    hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    icon: { fontSize: 64 },
    title: { fontSize: 26, fontWeight: '800', color: '#111827', textAlign: 'center' },
    body: {
        fontSize: 15, color: '#6B7280', lineHeight: 23,
        textAlign: 'center', paddingHorizontal: 8,
    },
    security: {
        fontSize: 13, color: '#059669', lineHeight: 20,
        textAlign: 'center', paddingHorizontal: 16,
        backgroundColor: '#ECFDF5', padding: 12, borderRadius: 10,
    },
    actions: { gap: 12, paddingBottom: 8 },
    btn: {
        backgroundColor: '#0F7B3F', borderRadius: 14,
        paddingVertical: 16, alignItems: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    skipLink: { alignItems: 'center', paddingVertical: 12 },
    skipText: { color: '#9CA3AF', fontSize: 14 },
});
