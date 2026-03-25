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

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

interface Props {
  onUnlock: () => Promise<boolean>;
}

/**
 * Full-screen lock UI rendered over all app content when biometric lock is active.
 * The user must authenticate to dismiss it.
 */
export function AppLockScreen({ onUnlock }: Props) {
  const colors = useTheme();
  const s = makeStyles(colors);
  return (
    <SafeAreaView style={s.safe} accessibilityViewIsModal>
      <View style={s.container}>
        <View style={s.iconWrap}>
          <Ionicons name="lock-closed" size={52} color={colors.brand} />
        </View>
        <Text style={s.title} accessibilityRole="header">
          MoniMata is locked
        </Text>
        <Text style={s.subtitle}>
          Authenticate to access your budget
        </Text>
        <TouchableOpacity
          style={s.btn}
          onPress={onUnlock}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Unlock MoniMata with biometrics or device PIN"
        >
          <Ionicons name="finger-print-outline" size={22} color={colors.white} style={s.btnIcon} />
          <Text style={s.btnText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.successSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 28,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textMeta,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 36,
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 36,
      borderRadius: 14,
    },
    btnIcon: {
      marginRight: 10,
    },
    btnText: {
      color: colors.white,
      fontSize: 17,
      fontWeight: '700',
    },
  });
}
