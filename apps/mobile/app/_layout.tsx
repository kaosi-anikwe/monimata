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
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_400Regular_Italic,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  PlusJakartaSans_800ExtraBold_Italic,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Ionicons } from '@expo/vector-icons';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import { getTheme, useTheme } from '@/lib/theme';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { radius, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';
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
  const colors = useTheme();
  const ns = makeNsStyles(colors);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    if (!loading) {
      // Primary hideAsync is in RootLayout; this is a safety call for the case
      // where the splash was somehow still visible when RootNavigator mounts.
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
      <StatusBar style='auto' />
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
              <Ionicons name="notifications" size={36} color={colors.brand} />
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
                  <Ionicons name={icon} size={16} color={colors.brand} style={ns.bulletIcon} />
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

function makeNsStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xxl,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.successSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 18,
    },
    title: {
      fontSize: 20,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.smd,
      letterSpacing: -0.3,
      ...ff(800),
    },
    body: {
      fontSize: 14,
      color: colors.textMeta,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 18,
      ...ff(400),
    },
    bullets: { width: '100%', marginBottom: spacing.xxl, gap: spacing.smd },
    bullet: { flexDirection: 'row', alignItems: 'center' },
    bulletIcon: { marginRight: spacing.smd },
    bulletText: { fontSize: 13, color: colors.textSecondary, flex: 1, ...ff(500) },
    allowBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.sm,
      paddingVertical: spacing.mdn,
      width: '100%',
      alignItems: 'center',
      marginBottom: spacing.smd,
    },
    allowBtnText: { color: colors.white, fontSize: 15, ...ff(700) },
    laterBtn: { paddingVertical: spacing.sm },
    laterBtnText: { color: colors.textMeta, fontSize: 14, ...ff(500) },
  });
}

function RootLayout() {
  // Load Plus Jakarta Sans in all required weights.
  // On font error we still render (system font fallback) so the app is usable.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_400Regular_Italic,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_800ExtraBold_Italic,
  });

  // The database must be initialized (encryption key retrieved from keychain)
  // before <DatabaseProvider> mounts. We hold here — the splash screen is already
  // kept visible by SplashScreen.preventAutoHideAsync() above, so the user never
  // sees a blank frame. Once both fonts and db are ready the full tree renders.
  const [db, setDb] = useState<Database | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  // Timeout guard: if DB or fonts aren't ready after 10 s, surface the hang.
  const [initTimeout, setInitTimeout] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setInitTimeout(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    initDatabase()
      .then(setDb)
      .catch((e) => {
        console.error('[MoniMata] DB init failed', e);
        setDbError(String(e?.message ?? e));
      });
  }, []);

  // Hide the native splash as soon as we have something to render.
  // This MUST happen here — RootNavigator (where hideAsync used to live) only
  // mounts after fonts+db are ready, so the splash would stay forever if we
  // waited until there.
  useEffect(() => {
    if (fontsLoaded && (db || dbError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, db, dbError]);

  if (dbError) {
    const c = getTheme(null);
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.background }}>
        <Text style={{ ...ff(700), fontSize: 16, color: c.textPrimary, marginBottom: 8 }}>
          Database failed to initialise
        </Text>
        <Text style={{ ...ff(400), fontSize: 13, color: c.textMeta, textAlign: 'center' }}>{dbError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !db) {
    const c = getTheme(null);
    return (
      <View style={{ flex: 1, backgroundColor: c.darkGreen, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <ActivityIndicator size="large" color={c.lime} />
        {initTimeout && (
          <Text style={{ ...ff(400), fontSize: 12, color: c.textInverseSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
            {!db ? 'Database is taking longer than expected…' : 'Loading fonts…'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
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
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

// Sentry.wrap instruments the root component for performance tracing and
// ensures uncaught promise rejections at the navigation level are captured.
export default Sentry.wrap(RootLayout);
