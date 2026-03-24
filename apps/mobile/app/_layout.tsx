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
 * Root layout — wraps the entire app in Redux, React Query, and WatermelonDB providers.
 * Triggers a WatermelonDB sync whenever the app comes to the foreground.
 */
import { Ionicons } from '@expo/vector-icons';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { AppLockScreen } from '@/components/AppLockScreen';
import { ToastProvider } from '@/components/Toast';
import { initDatabase } from '@/database';
import { syncDatabase } from '@/database/sync';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { useJobEvents } from '@/hooks/useJobEvents';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initSentry, Sentry } from '@/lib/sentry';
import { setLogoutHandler } from '@/services/api';
import { store } from '@/store';
import { clearAuth, restoreSession } from '@/store/authSlice';
import { syncToCurrentMonth } from '@/store/budgetSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { Database } from '@nozbe/watermelondb';

// Initialise Sentry before the app renders so the first frame is covered.
initSentry();

// Register the logout handler for the API interceptor. This breaks the circular
// dependency api.ts → store → authSlice → api.ts by wiring the callback here,
// after both modules are fully initialised.
setLogoutHandler(() => store.dispatch(clearAuth()));

// Database is initialised lazily inside RootLayout (in the useEffect that runs
// before <DatabaseProvider> renders). initDatabase() generates/retrieves the
// SQLCipher key from the OS keychain and constructs the WatermelonDB adapter.

// Keep the splash screen visible while we restore the session.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
});

function RootNavigator() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, loading } = useAppSelector((s) => s.auth);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Register for push notifications and send device token to backend
  const { showPrePrompt, handleAllow, handleDismiss } = usePushNotifications();

  // WebSocket connection — real-time cache invalidation after Celery jobs.
  useJobEvents();

  // Biometric lock.
  const { isLocked, unlock } = useBiometricLock();

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  // Sync WatermelonDB whenever app comes to the foreground
  useEffect(() => {
    if (!isAuthenticated) return;
    // Initial sync on mount
    syncDatabase().catch(console.warn);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncDatabase().catch(console.warn);
        // Advance selectedMonth if the calendar month rolled over while backgrounded.
        dispatch(syncToCurrentMonth());
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated, dispatch]);

  if (loading) return null;

  // Show the lock screen over all content when biometric lock is active.
  if (isLocked && isAuthenticated) {
    return <AppLockScreen onUnlock={unlock} />;
  }

  return (
    <>
      <StatusBar style='dark' />
      <Stack screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
      </Stack>

      {/* Pre-permission explanatory modal — shown once before the OS dialog */}
      <Modal
        visible={showPrePrompt}
        transparent
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <View style={ns.overlay}>
          <View style={ns.card}>
            <View style={ns.iconWrap}>
              <Ionicons name="notifications" size={36} color="#0F7B3F" />
            </View>
            <Text style={ns.title}>Stay on top of your budget</Text>
            <Text style={ns.body}>
              MoniMata sends you nudges when your spending needs attention — so
              you always know what&apos;s going on with your money.
            </Text>

            <View style={ns.bullets}>
              {([
                ['flash-outline', 'Instant alerts when a category is nearly full'],
                ['trending-up-outline', 'Heads-up for unusually large transactions'],
                ['bulb-outline', 'Smart tips based on your spending patterns'],
              ] as const).map(([icon, label]) => (
                <View key={label} style={ns.bullet}>
                  <Ionicons name={icon} size={16} color="#0F7B3F" style={ns.bulletIcon} />
                  <Text style={ns.bulletText}>{label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={ns.allowBtn} onPress={handleAllow} activeOpacity={0.85}>
              <Text style={ns.allowBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ns.laterBtn} onPress={handleDismiss}>
              <Text style={ns.laterBtnText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const ns = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  bullets: { width: '100%', marginBottom: 24, gap: 10 },
  bullet: { flexDirection: 'row', alignItems: 'center' },
  bulletIcon: { marginRight: 10 },
  bulletText: { fontSize: 13, color: '#374151', flex: 1 },
  allowBtn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  allowBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  laterBtn: { paddingVertical: 8 },
  laterBtnText: { color: '#6B7280', fontSize: 14 },
});

function RootLayout() {
  // The database must be initialized (encryption key retrieved from keychain)
  // before <DatabaseProvider> mounts. We hold here — the splash screen is already
  // kept visible by SplashScreen.preventAutoHideAsync() above, so the user never
  // sees a blank frame. Once the db is ready the full tree renders.
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    initDatabase()
      .then(setDb)
      .catch((e) => console.error('[MoniMata] DB init failed', e));
  }, []);

  if (!db) return null;

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider database={db}>
          <SafeAreaProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </SafeAreaProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </Provider>
  );
}

// Sentry.wrap instruments the root component for performance tracing and
// ensures uncaught promise rejections at the navigation level are captured.
export default Sentry.wrap(RootLayout);
