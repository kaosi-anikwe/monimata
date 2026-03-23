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

import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function AccountsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.c}>
        <Text style={styles.t}>Accounts</Text>
        <Text style={styles.sub}>Link a bank account from the Profile tab to see balances here.</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => router.push('/(auth)/link-bank')}>
          <Text style={styles.btnPrimaryText}>Link an account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  c: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  t: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sub: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  btnPrimary: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#0F7B3F', fontSize: 16, fontWeight: '700' },
});
