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
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';
import { clearError, verifyBVN } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
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
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bvn: '' },
  });

  const bvnValue = watch('bvn');

  async function onSubmit(data: FormValues) {
    dispatch(clearError());
    try {
      await dispatch(verifyBVN(data.bvn)).unwrap();
      // If user is already onboarded (came here from profile), go straight to link-bank.
      // Otherwise continue the onboarding flow.
      router.replace(user?.onboarded ? '/(auth)/link-bank' : '/(auth)/onboarding');
    } catch {
      // error is already written to Redux state by the rejected handler in authSlice
    }
  }

  function handleNumpad(digit: string) {
    if (bvnValue.length < 11) {
      setValue('bvn', bvnValue + digit, { shouldValidate: true });
    }
  }

  function handleDelete() {
    setValue('bvn', bvnValue.slice(0, -1), { shouldValidate: true });
  }

  // If user already verified (returning user), skip onboarding and go to link-bank
  if (user?.identity_verified) {
    router.replace('/(auth)/link-bank');
    return null;
  }

  const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

  return (
    <View style={[authS.screen, { backgroundColor: colors.white }]}>
      <StatusBar style="light" />
      {/* ── Dark green curved header ── */}
      <AuthHdr>
        <BackBtn onPress={() => router.back()} />
        <Text style={[authS.authTitle, { color: colors.white }]}>Prove it&apos;s you, once.</Text>
        <Text style={[authS.authSub, { color: colors.textInverseSecondary }]}>
          We verify your BVN with Interswitch — we never store, see, or share it.
        </Text>
      </AuthHdr>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[authS.body, { paddingTop: 16 }]} showsVerticalScrollIndicator={false}>
          {/* Trust card */}
          <TrustCard
            text="CBN-compliant identity check — MoniMata does not store your BVN. It is sent once to Interswitch's identity service and immediately discarded."
            colors={colors}
          />

          {error ? (
            <View style={[authS.errorBanner, { backgroundColor: colors.errorSubtle, marginBottom: 16 }]}>
              <Text style={[authS.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Label */}
          <Text style={[authS.fieldLbl, { color: colors.textSecondary, marginBottom: 12 }]}>
            Enter your 11-digit BVN
          </Text>

          {/* 11 digit boxes */}
          <Controller
            control={control}
            name="bvn"
            render={() => (
              <View style={bvnS.boxes}>
                {Array.from({ length: 11 }).map((_, i) => {
                  const filled = i < bvnValue.length;
                  const active = i === bvnValue.length;
                  return (
                    <View
                      key={i}
                      style={[
                        bvnS.box,
                        {
                          borderColor: filled || active ? colors.brand : colors.border,
                          backgroundColor: filled ? colors.surface : colors.white,
                        },
                        active && { shadowColor: colors.brand, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
                      ]}
                    >
                      <Text style={[bvnS.boxText, { color: colors.brand }]}>
                        {filled ? bvnValue[i] : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          />

          {/* Digit count + USSD hint */}
          <Text style={[bvnS.count, { color: colors.textMeta }]}>{bvnValue.length}/11 digits</Text>
          <View style={[bvnS.ussdHint, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorderLight }]}>
            <Text style={[bvnS.ussdText, { color: colors.warningText }]}>
              Dial <Text style={bvnS.ussdCode}>*565*0#</Text> on any network to retrieve your BVN
            </Text>
          </View>

          {/* Numpad */}
          <View style={bvnS.numpad}>
            {NUMPAD.map((key, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  bvnS.numKey,
                  { backgroundColor: key === '' ? 'transparent' : colors.surface },
                  key === '' && { elevation: 0 },
                ]}
                onPress={() => {
                  if (key === 'del') handleDelete();
                  else if (key !== '') handleNumpad(key);
                }}
                disabled={key === ''}
                activeOpacity={0.65}
              >
                {key === 'del' ? (
                  <Ionicons name="backspace-outline" size={20} color={colors.textSecondary} />
                ) : (
                  <Text style={[bvnS.numKeyText, { color: colors.textPrimary }]}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[
              authS.btnGreen,
              { backgroundColor: colors.brand },
              (loading || bvnValue.length !== 11) && authS.btnDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading || bvnValue.length !== 11}
            accessibilityRole="button"
            accessibilityLabel="Verify identity"
            accessibilityState={{ disabled: loading || bvnValue.length !== 11 }}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={[authS.btnText, { color: colors.white }]}>Verify Identity</Text>}
          </TouchableOpacity>
          {errors.bvn ? <Text style={[authS.fieldErr, { color: colors.error, textAlign: 'center', marginTop: 8 }]}>{errors.bvn.message}</Text> : null}

          {/* Skip link — takes user to onboarding questionnaire so their
              budget categories are still seeded even without BVN verification */}
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
  boxes: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    flexWrap: 'nowrap',
  },
  box: {
    width: 27,
    height: 38,
    borderWidth: 1.5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: { ...ff(800), fontSize: 16 },
  count: { ...ff(400), fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  ussdHint: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  ussdText: { ...ff(400), fontSize: 12 },
  ussdCode: { ...ff(700) },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: 16,
  },
  numKey: {
    width: '30%',
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numKeyText: { ...ff(600), fontSize: 19 },
});
