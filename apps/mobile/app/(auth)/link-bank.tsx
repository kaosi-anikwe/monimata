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
 * On success, exchanges the one-time auth_code for a linked bank account
 * via POST /accounts/connect.
 *
 * Set EXPO_PUBLIC_MONO_PUBLIC_KEY in apps/mobile/.env
 */
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';

import api from '@/services/api';
import type { RootState } from '@/store';

// ── Inner component — must live inside <MonoProvider> to use the hook ────────

interface ConnectButtonProps {
  isPending: boolean;
}

function ConnectButton({ isPending }: ConnectButtonProps) {
  const { init } = useMonoConnect();

  return (
    <TouchableOpacity
      style={[styles.btn, isPending && styles.btnDisabled]}
      onPress={() => init()}
      disabled={isPending}
    >
      {isPending
        ? <ActivityIndicator color="#fff" />
        : <Text style={styles.btnText}>Connect Bank Account</Text>}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LinkBankScreen() {
  const user = useSelector((state: RootState) => state.auth.user);

  const connectMutation = useMutation({
    mutationFn: (code: string) =>
      api.post('/accounts/connect', { code }).then((r) => r.data),
    onSuccess: () => {
      Alert.alert(
        'Bank linked! 🎉',
        'We are now fetching your transaction history. This may take a minute.',
        [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
      );
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail ?? 'Please try again.';
      Alert.alert('Could not link account', detail);
    },
  });

  const monoConfig = {
    publicKey: process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY ?? '',
    scope: 'auth' as const,
    data: {
      customer: {
        name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'MoniMata User',
        ...(user?.email ? { email: user.email } : {}),
      },
    },
    onSuccess: (data: { getAuthCode: () => string }) => {
      const code = data.getAuthCode();
      connectMutation.mutate(code);
    },
    onClose: () => {
      // Widget dismissed without linking — no action needed
    },
    onEvent: (eventName: string, data: Record<string, unknown>) => {
      if (__DEV__) {
        console.log('[MonoConnect]', eventName, data);
      }
    },
  };

  return (
    <MonoProvider {...monoConfig}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text>
              <Ionicons name='business' size={64} color="#0F7B3F" />
            </Text>
            <Text style={styles.title}>Link your bank account</Text>
            <Text style={styles.body}>
              Connect your GTBank, Kuda, Zenith, OPay or any Nigerian bank account.
              MoniMata will automatically import your transactions every day.
            </Text>
            <Text style={styles.security}>
              🔒 Powered by Mono. Your bank credentials go directly to Mono — MoniMata
              never sees them.
            </Text>
          </View>

          <View style={styles.actions}>
            <ConnectButton isPending={connectMutation.isPending} />

            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={styles.skipLink}
            >
              <Text style={styles.skipText}>I&apos;ll do this later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </MonoProvider>
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
