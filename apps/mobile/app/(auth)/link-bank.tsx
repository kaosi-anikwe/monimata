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
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';
import {
  ActivityIndicator,
  StyleSheet,
  Text, TouchableOpacity,
  View,
} from 'react-native';

import api from '@/services/api';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import type { RootState } from '@/store';
import { useToast } from '@/components/Toast';
import { AuthHdr, BackBtn, TrustCard, s as authS } from './_authShared';

// ── Inner component — must live inside <MonoProvider> to use the hook ────────

interface ConnectButtonProps {
  isPending: boolean;
}

function ConnectButton({ isPending }: ConnectButtonProps) {
  const { init } = useMonoConnect();
  const colors = useTheme();

  return (
    <TouchableOpacity
      style={[authS.btnGreen, isPending && authS.btnDisabled, { backgroundColor: colors.brand }]}
      onPress={() => init()}
      disabled={isPending}
    >
      {isPending
        ? <ActivityIndicator color={colors.white} />
        : <Text style={[authS.btnText, { color: colors.white }]}>Connect Bank Account</Text>}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LinkBankScreen() {
  const user = useSelector((state: RootState) => state.auth.user);
  const { success, error } = useToast();

  const connectMutation = useMutation({
    mutationFn: (code: string) =>
      api.post('/accounts/connect', { code }).then((r) => r.data),
    onSuccess: () => {
      success('Bank linked! 🎉', 'We are fetching your transaction history. This may take a minute.');
      router.replace('/(tabs)');
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail ?? 'Please try again.';
      error('Could not link account', detail);
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

  const colors = useTheme();

  return (
    <MonoProvider {...monoConfig}>
      <View style={[authS.screen, { backgroundColor: colors.cardBg }]}>

        {/* ── Dark green curved header ── */}
        <AuthHdr>
          <BackBtn onPress={() => router.back()} />
          <Text style={[authS.authTitle, { color: colors.white }]}>Connect your bank</Text>
          <Text style={[authS.authSub, { color: colors.textInverseSecondary }]}>
            Automatic transaction sync — no more manual entry
          </Text>
        </AuthHdr>

        {/* ── Body ── */}
        <View style={[authS.body, { flex: 1, justifyContent: 'space-between' }]}>
          <TrustCard
            text="Powered by Mono — your login credentials go directly to your bank and never touch MoniMata's servers."
            colors={colors}
          />

          <View style={styles.actions}>
            <ConnectButton isPending={connectMutation.isPending} />
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={authS.navLink}
            >
              <Text style={[authS.navLinkText, { color: colors.textMeta }]}>
                I&apos;ll do this later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </MonoProvider>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, paddingBottom: spacing.lg },
});
