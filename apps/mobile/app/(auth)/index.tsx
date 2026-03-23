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
 * Welcome / Onboarding index screen.
 * Entry point for unauthenticated users.
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.hero}>
                <Text style={styles.logo}>₦ MoniMata</Text>
                <Text style={styles.tagline}>Every Kobo, Accounted For.</Text>
                <Text style={styles.sub}>
                    Zero-based budgeting for Nigerians — with automatic bank sync and AI-powered spending nudges.
                </Text>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity style={styles.btnPrimary} onPress={() => router.push('/(auth)/register')}>
                    <Text style={styles.btnPrimaryText}>Get Started</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => router.push('/(auth)/login')}>
                    <Text style={styles.btnSecondaryText}>I already have an account</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F7B3F', padding: 24 },
    hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    logo: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
    tagline: { fontSize: 18, fontWeight: '600', color: '#A7F3C8', textAlign: 'center' },
    sub: { fontSize: 15, color: '#D1FAE5', textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
    actions: { gap: 12, paddingBottom: 8 },
    btnPrimary: {
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    btnPrimaryText: { color: '#0F7B3F', fontSize: 16, fontWeight: '700' },
    btnSecondary: {
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.6)',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    btnSecondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
