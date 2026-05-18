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
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { AppLockScreen } from '@/components/AppLockScreen';
import { AppWelcome } from '@/components/AppWelcome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { TourProvider } from '@/components/tour';
import { initDatabase } from '@/database';
import { syncDatabase } from '@/database/sync';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { useJobEvents } from '@/hooks/useJobEvents';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initSentry, Sentry } from '@/lib/sentry';
import { getTheme, useTheme } from '@/lib/theme';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { setLogoutHandler, uploadReceipt } from '@/services/api';
import { store, type RootState } from '@/store';
import { clearAuth, restoreSession } from '@/store/authSlice';
import { syncToCurrentMonth } from '@/store/budgetSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { Database } from '@nozbe/watermelondb';
import * as QuickActions from 'expo-quick-actions';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';

// Initialise Sentry before the app renders so the first frame is covered.
initSentry();

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
  const { isAuthenticated, loading, isInitialised, user } = useAppSelector((s: RootState) => s.auth);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const router = useRouter();

  // Register the logout handler here (inside the component) so it:
  // a) survives Fast Refresh re-evaluations of api.ts, and
  // b) has access to router.replace for a guaranteed imperative navigation.
  useEffect(() => {
    setLogoutHandler(() => {
      store.dispatch(clearAuth());
      router.replace('/(auth)');
    });
  }, [router]);

  // Register for push notifications and send device token to backend
  const { showPrePrompt, handleAllow, handleDismiss } = usePushNotifications();

  // WebSocket connection — real-time cache invalidation after Celery jobs.
  useJobEvents();

  // ── Home-screen quick actions ────────────────────────────────────────────────
  // Register shortcuts once the user is authenticated so they appear on the
  // home screen long-press menu.  Removed automatically when the user logs out.
  useEffect(() => {
    if (!isAuthenticated) {
      QuickActions.setItems([]);
      return;
    }

    QuickActions.setItems([
      {
        id: 'add-transaction',
        title: 'Add Transaction',
        subtitle: 'Log a manual entry',
        // iOS: SF Symbol   Android: adaptive drawable defined in plugin config
        icon: Platform.OS === 'android' ? 'add_transaction_icon' : 'symbol:plus.circle.fill',
        params: { href: '/add-transaction' },
      },
      {
        id: 'upload-receipt',
        title: 'Upload Receipt',
        subtitle: 'Scan or import a receipt',
        icon: Platform.OS === 'android' ? 'upload_receipt_icon' : 'symbol:doc.viewfinder',
        params: { href: '/upload-receipt' },
      },
    ]);

    // Handle the action that cold-started the app.
    if (QuickActions.initial) {
      const href = QuickActions.initial.params?.href;
      if (typeof href === 'string') {
        // Defer one frame so the navigator tree is mounted before pushing.
        const id = requestAnimationFrame(() => router.push(href as never));
        return () => cancelAnimationFrame(id);
      }
    }

    // Handle taps while the app is already running.
    const sub = QuickActions.addListener((action) => {
      const href = action.params?.href;
      if (typeof href === 'string') router.push(href as never);
    });
    return () => sub.remove();
  }, [isAuthenticated, router]);

  // Biometric lock.
  const { isLocked, unlock } = useBiometricLock();
  const colors = useTheme();
  const ns = makeNsStyles(colors);

  // Track the current deep path so we can restore it after a password-fallback
  // re-login (biometric unlock preserves navigation automatically via overlay).
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const postLockReturnPath = useRef<string | null>(null);

  // When isAuthenticated flips false → true and we have a saved path, restore it.
  const prevAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (!prevAuthenticated.current && isAuthenticated && postLockReturnPath.current) {
      const path = postLockReturnPath.current;
      postLockReturnPath.current = null;
      // Double-rAF: first frame queues after the current paint, second fires
      // after layout has committed — standard post-InteractionManager pattern.
      let cancelled = false;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) {
            try { router.replace(path as never); } catch { /* path no longer valid */ }
          }
        });
      });
      return () => { cancelled = true; cancelAnimationFrame(id); };
    }
    prevAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, router]);

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

    // Sync then invalidate all TanStack Query caches so every screen re-reads
    // from WatermelonDB without requiring a manual pull-to-refresh.
    const syncAndInvalidate = () =>
      syncDatabase()
        .then(() => queryClient.invalidateQueries())
        .catch(console.warn);

    // Initial sync on mount (first login or cold start)
    syncAndInvalidate();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncAndInvalidate();
        // Advance selectedMonth if the calendar month rolled over while backgrounded.
        dispatch(syncToCurrentMonth());
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated, dispatch]);

  if (!isInitialised) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        {isAuthenticated && (user?.onboarded ?? false) ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
      </Stack>

      {/* Lock screen — rendered as an absolute overlay so the Stack stays mounted.
           This preserves deep navigation for biometric unlocks. For the
           password fallback the path is saved/restored via postLockReturnPath. */}
      {isLocked && isAuthenticated && (
        <AppLockScreen
          onUnlock={unlock}
          onPasswordLogin={() => { postLockReturnPath.current = pathnameRef.current; }}
        />
      )}

      {/* Welcome walkthrough — shown once per account, immediately after sign-up
           (before the onboarding questionnaire). AppWelcome guards itself via a
           per-user SecureStore flag so it only ever renders once. */}
      {isAuthenticated && user?.id && (
        <AppWelcome userId={user.id} />
      )}

      {/* Share-intent file upload — processes files shared from other apps */}
      {isAuthenticated && <ShareIntentHandler />}

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
      backgroundColor: colors.cardBg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xxl,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
    },
    iconWrap: {
      width: layout.avatarLg + spacing.lg,
      height: layout.avatarLg + spacing.lg,
      borderRadius: radius.full,
      backgroundColor: colors.successSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg + spacing.xs,
    },
    title: {
      ...type_.h1,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.smd,
    },
    body: {
      ...type_.body,
      color: colors.textMeta,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.lg + spacing.xs,
    },
    bullets: { width: '100%', marginBottom: spacing.xxl, gap: spacing.smd },
    bullet: { flexDirection: 'row', alignItems: 'center' },
    bulletIcon: { marginRight: spacing.smd },
    bulletText: { ...type_.bodyReg, color: colors.textSecondary, flex: 1 },
    allowBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.sm,
      paddingVertical: spacing.mdn,
      width: '100%',
      alignItems: 'center',
      marginBottom: spacing.smd,
    },
    allowBtnText: { ...type_.btnLg, color: colors.white },
    laterBtn: { paddingVertical: spacing.sm },
    laterBtnText: { ...type_.body, color: colors.textMeta },
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, backgroundColor: c.background }}>
        <Text style={{ ...ff(700), ...type_.h3, color: c.textPrimary, marginBottom: spacing.sm }}>
          Database failed to initialise
        </Text>
        <Text style={{ ...type_.bodyReg, color: c.textMeta, textAlign: 'center' }}>{dbError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !db) {
    const c = getTheme(null);
    return (
      <View style={{ flex: 1, backgroundColor: c.darkGreen, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        <ActivityIndicator size="large" color={c.lime} />
        {initTimeout && (
          <Text style={{ ...type_.small, color: c.textInverseSecondary, textAlign: 'center', paddingHorizontal: spacing.xxxl }}>
            {!db ? 'Database is taking longer than expected…' : 'Loading fonts…'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Provider store={store}>
            <QueryClientProvider client={queryClient}>
              <DatabaseProvider database={db}>
                <SafeAreaProvider>
                  <ToastProvider>
                    <TourProvider>
                      <ErrorBoundary>
                        <RootNavigator />
                      </ErrorBoundary>
                    </TourProvider>
                  </ToastProvider>
                </SafeAreaProvider>
              </DatabaseProvider>
            </QueryClientProvider>
          </Provider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}

// ── ShareIntentHandler ───────────────────────────────────────────────────────
// Mounted inside RootNavigator so it has access to ToastProvider.
// Processes incoming share-extension files silently — uploads to /uploads/receipt
// without navigating the user anywhere.
function ShareIntentHandler() {
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const handlingRef = useRef(false);

  useEffect(() => {
    if (!shareIntent || handlingRef.current) return;

    const files = shareIntent.files;
    if (!files?.length) {
      resetShareIntent();
      return;
    }

    handlingRef.current = true;
    const sharedFile = files[0];

    // Accept images and PDFs only.
    const mime = sharedFile.mimeType ?? '';
    const isImage = mime.startsWith('image/');
    const isPdf = mime === 'application/pdf';
    if (!isImage && !isPdf) {
      toastError('Unsupported file', 'Only images and PDFs are accepted as receipts.');
      resetShareIntent();
      handlingRef.current = false;
      return;
    }

    toastInfo('Uploading receipt…', 'Processing your file in the background.');

    uploadReceipt({
      uri: sharedFile.path,
      mimeType: mime,
      name: sharedFile.fileName ?? `shared_receipt_${Date.now()}`,
    })
      .then(() => {
        toastSuccess('Receipt uploaded!', "We'll notify you when the transaction is ready.");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toastError('Upload failed', msg);
      })
      .finally(() => {
        resetShareIntent();
        handlingRef.current = false;
      });
  }, [shareIntent, resetShareIntent, toastSuccess, toastError, toastInfo]);

  return null;
}

// Sentry.wrap instruments the root component for performance tracing and
// ensures uncaught promise rejections at the navigation level are captured.
export default Sentry.wrap(RootLayout);
