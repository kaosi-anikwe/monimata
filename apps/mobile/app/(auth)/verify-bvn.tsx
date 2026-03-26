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
import { z } from 'zod';
import { router } from 'expo-router';
import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { StatusBar } from 'expo-status-bar';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { clearError, verifyBVN } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthHdr, BackBtn, TrustCard, s as authS } from './_authShared';

const schema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
});

type FormValues = z.infer<typeof schema>;

export default function VerifyBVNScreen() {
  const dispatch = useAppDispatch();
  const { loading, error, user } = useAppSelector((st) => st.auth);
  const colors = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bvn: '' },
  });

  async function onSubmit(data: FormValues) {
    dispatch(clearError());
    try {
      await dispatch(verifyBVN(data.bvn)).unwrap();
      router.replace(user?.onboarded ? '/(auth)/link-bank' : '/(auth)/onboarding');
    } catch {
      // error is already written to Redux state by the rejected handler in authSlice
    }
  }

  // If user already verified (returning user), skip onboarding and go to link-bank
  if (user?.identity_verified) {
    router.replace('/(auth)/link-bank');
    return null;
  }

  return (
    <View style={[authS.screen, { backgroundColor: colors.cardBg }]}>
      <StatusBar style="light" />
      <AuthHdr>
        <BackBtn onPress={() => router.back()} />
        <Text style={[authS.authTitle, { color: colors.white }]}>Prove it&apos;s you, once.</Text>
        <Text style={[authS.authSub, { color: colors.textInverseSecondary }]}>
          We verify your BVN with Interswitch — we never store, see, or share it.
        </Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[authS.body, { paddingTop: 16 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TrustCard
            text="CBN-compliant identity check — MoniMata does not store your BVN. It is sent once to Interswitch's identity service and immediately discarded."
            colors={colors}
          />

          {error ? (
            <View style={[authS.errorBanner, { backgroundColor: colors.errorSubtle, marginBottom: 16 }]}>
              <Text style={[authS.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={[authS.fieldLbl, { color: colors.textSecondary, marginBottom: 12 }]}>
            Enter your 11-digit BVN
          </Text>

          {/* ── BVN single input ── */}
          <Controller
            control={control}
            name="bvn"
            render={({ field: { value, onChange, onBlur } }) => (
              <>
                <View style={[
                  bvnS.inputWrap,
                  {
                    backgroundColor: colors.surface,
                    borderColor: errors.bvn ? colors.error : colors.brand,
                  },
                ]}>
                  <View style={{ backgroundColor: errors.bvn ? colors.error : colors.brand }} />
                  <TextInput
                    value={value}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/\D/g, '').slice(0, 11);
                      onChange(cleaned);
                    }}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    maxLength={11}
                    autoFocus
                    placeholder="00000000000"
                    placeholderTextColor={colors.textTertiary}
                    style={[bvnS.input, { color: colors.brand }]}
                    accessibilityLabel="BVN"
                    returnKeyType="done"
                  />
                </View>

                <View style={bvnS.inputMeta}>
                  {errors.bvn ? (
                    <Text style={[bvnS.metaText, { color: colors.error }]}>{errors.bvn.message}</Text>
                  ) : (
                    <Text style={[bvnS.metaText, { color: colors.textMeta }]}>Type or paste your BVN</Text>
                  )}
                  <Text style={[bvnS.metaText, { color: value.length === 11 ? colors.brand : colors.textMeta }]}>
                    {value.length}/11
                  </Text>
                </View>
              </>
            )}
          />

          {/* USSD hint */}
          <View style={[bvnS.ussdHint, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorderLight, marginTop: 16 }]}>
            <Text style={[bvnS.ussdText, { color: colors.warningText }]}>
              Don&apos;t know your BVN? Dial <Text style={bvnS.ussdCode}>*565*0#</Text> on any network.
            </Text>
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[
              authS.btnGreen,
              { backgroundColor: colors.brand, marginTop: 24 },
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Verify identity"
            accessibilityState={{ disabled: loading }}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={[authS.btnText, { color: colors.white }]}>Verify Identity</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/onboarding')} style={{ alignItems: 'center', marginTop: 16 }}>
            <Text style={[{ ...ff(400), fontSize: 12, textDecorationLine: 'underline' }, { color: colors.textTertiary }]}>
              Skip BVN — set up my budget instead
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const bvnS = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
    height: 60,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    ...ff(700),
  },
  inputMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  metaText: {
    ...ff(400),
    fontSize: 12,
  },
  ussdHint: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  ussdText: { ...ff(400), fontSize: 12 },
  ussdCode: { ...ff(700) },
});
