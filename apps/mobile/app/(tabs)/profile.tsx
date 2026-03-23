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

import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';

export default function ProfileScreen() {
    const dispatch = useAppDispatch();
    const { user } = useAppSelector((s) => s.auth);

    function handleLogout() {
        Alert.alert('Log out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: async () => {
                    await dispatch(logout());
                    router.replace('/(auth)');
                },
            },
        ]);
    }

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.c}>
                <Text style={s.name}>{user?.first_name ?? 'Hey there'} 👋</Text>
                <Text style={s.email}>{user?.email}</Text>
                {!user?.identity_verified && (
                    <TouchableOpacity style={s.bvnBanner} onPress={() => router.push('/(auth)/verify-bvn')}>
                        <Text style={s.bvnText}>⚠️ Complete BVN verification to link a bank account</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
                    <Text style={s.logoutText}>Log Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#fff' },
    c: { flex: 1, padding: 24 },
    name: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: 24 },
    email: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
    bvnBanner: {
        backgroundColor: '#FEF3C7', padding: 14, borderRadius: 10, marginBottom: 24,
    },
    bvnText: { color: '#92400E', fontSize: 13, fontWeight: '600' },
    logoutBtn: {
        borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 12,
        paddingVertical: 14, alignItems: 'center', marginTop: 'auto',
    },
    logoutText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});
