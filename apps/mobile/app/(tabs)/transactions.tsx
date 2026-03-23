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

import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TransactionsScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.c}>
        <Text style={s.t}>Transactions</Text>
        <Text style={s.sub}>Sync a bank account to see transactions here.</Text>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  c: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  t: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sub: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
});
