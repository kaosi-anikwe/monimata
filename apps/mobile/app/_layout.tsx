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
import { Stack } from 'expo-router';
import { Provider } from 'react-redux';
import { StatusBar } from "expo-status-bar"
import { useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';

import { store } from '@/store';
import database from '@/database';
import { syncDatabase } from '@/database/sync';
import { restoreSession } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

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
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  if (loading) return null;

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
    </>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider database={database}>
          <SafeAreaProvider>
            <RootNavigator />
          </SafeAreaProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </Provider>
  );
}
