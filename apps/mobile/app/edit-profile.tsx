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
 * Edit Profile screen — update name, username, email, and phone number.
 * PATCHes /auth/me and updates the Redux user state on success.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { Button, Input, ScreenHeader, SectionHeader } from '@/components/ui';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import { $api } from '@/services/api';
import { setUser } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { UpdateProfilePayload, User } from '@monimata/shared-types';

export default function EditProfileScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors);
  const dispatch = useAppDispatch();
  const { success: showSuccess, error: showError } = useToast();

  useStatusBarStyle('light');

  const user = useAppSelector((s) => s.auth.user);

  // ── Local form state seeded from the Redux user ───────────────────────────
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  // Re-seed if the user object changes (e.g. concurrent update from another device).
  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name ?? '');
    setLastName(user.last_name ?? '');
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfile = $api.useMutation('patch', '/auth/me', {
    onSuccess: (updated) => {
      dispatch(setUser(updated as User));
      showSuccess('Profile updated', 'Your changes have been saved.');
      router.back();
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: string })?.detail;
      showError('Update failed', detail ?? 'Please try again.');
    },
  });

  function isDirty(): boolean {
    return (
      firstName.trim() !== (user?.first_name ?? '') ||
      lastName.trim() !== (user?.last_name ?? '') ||
      email.trim() !== (user?.email ?? '') ||
      phone.trim() !== (user?.phone ?? '')
    );
  }

  function handleSave() {
    if (!isDirty()) { router.back(); return; }

    const body: UpdateProfilePayload = {};
    if (firstName.trim() !== (user?.first_name ?? '')) body.first_name = firstName.trim() || null;
    if (lastName.trim() !== (user?.last_name ?? '')) body.last_name = lastName.trim() || null;
    if (email.trim() !== (user?.email ?? '')) body.email = email.trim() || null;
    if (phone.trim() !== (user?.phone ?? '')) body.phone = phone.trim() || null;

    updateProfile.mutate({ body });
  }

  const isSaving = updateProfile.isPending;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Edit Profile"
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.md}
      />

      <KeyboardAvoidingView
        style={ss.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[ss.content, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Name ──────────────────────────────────────────────────── */}
          <SectionHeader
            title="Name"
            variant="group"
            paddingHorizontal={0}
            style={{ marginBottom: spacing.xs }}
          />
          <Input
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            autoCapitalize="words"
            textContentType="givenName"
            returnKeyType="next"
          />
          <Input
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            autoCapitalize="words"
            textContentType="familyName"
            returnKeyType="next"
            containerStyle={{ marginTop: spacing.sm }}
          />

          {/* ── Account ───────────────────────────────────────────────── */}
          <SectionHeader
            title="Account"
            variant="group"
            paddingHorizontal={0}
            style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}
          />
          {user?.username ? (
            <View style={[ss.readOnlyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[type_.label, { color: colors.textTertiary }]}>Username</Text>
              <Text style={[type_.body, { marginTop: spacing.xxs }]}>
                <Text style={{ color: colors.brand, fontWeight: '600' }}>{user.username}</Text>
                <Text style={{ color: colors.textMeta }}>@moni-mata.ng</Text>
              </Text>
            </View>
          ) : null}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            containerStyle={{ marginTop: user?.username ? spacing.sm : 0 }}
          />
          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+234 800 000 0000"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            returnKeyType="done"
            containerStyle={{ marginTop: spacing.sm }}
          />

          {/* ── Verified badge (read-only) ────────────────────────────── */}
          {user?.identity_verified && (
            <View style={[ss.verifiedRow, { backgroundColor: colors.successSubtle }]}>
              <Text style={[type_.small, { color: colors.successText }]}>
                ✓  Identity verified
              </Text>
            </View>
          )}

          <Button
            variant="green"
            onPress={handleSave}
            disabled={isSaving}
            loading={isSaving}
            style={{ marginTop: spacing.xl }}
            accessibilityLabel="Save profile changes"
          >
            Save Changes
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    verifiedRow: {
      marginTop: spacing.md,
      borderRadius: 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
    },
    readOnlyRow: {
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
  });
}
