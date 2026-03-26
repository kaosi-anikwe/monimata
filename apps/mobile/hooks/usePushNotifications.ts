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
 * usePushNotifications
 *
 * Handles the full push notification lifecycle:
 *   1. Requests OS notification permissions on first mount.
 *   2. Retrieves the Expo push token (works in Expo Go + dev builds without
 *      a native FCM setup — tokens are "ExponentPushToken[...]").
 *   3. Sends the token to POST /nudges/register-device so the backend can
 *      reach this device.
 *   4. Registers a foreground notification handler that shows an in-app
 *      toast-style alert instead of the OS banner, so the user never misses
 *      a nudge while the app is active.
 *   5. Registers a notification-response handler (user taps the OS banner)
 *      that navigates to the Nudges tab.
 */

import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';

import { lightColors } from '@/lib/theme';
import type { RootState } from '../store';
import { useToast } from '@/components/Toast';
import { useRegisterDevice } from './useNudges';

// Show notifications as banners even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});

/** Persisted key — once set, we never show the in-app pre-prompt again. */
const PRIMED_KEY = 'notif_primed';

export interface PushNotificationConsent {
  showPrePrompt: boolean;
  handleAllow: () => Promise<void>;
  handleDismiss: () => void;
}

export function usePushNotifications(): PushNotificationConsent {
  const router = useRouter();
  const { confirm } = useToast();
  const registerDevice = useRegisterDevice();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const [showPrePrompt, setShowPrePrompt] = useState(false);

  const mountedRef = useRef(true);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  async function doTokenSetup() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MoniMata Nudges',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: lightColors.brand,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '6f68cf17-0eea-4815-8e6c-e821e0823fe6',
    });

    if (mountedRef.current) {
      registerDevice.mutate({ token: tokenData.data });
    }
  }

  async function handleAllow() {
    setShowPrePrompt(false);
    await SecureStore.setItemAsync(PRIMED_KEY, '1');
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        await doTokenSetup();
      }
    } catch (err) {
      console.warn('usePushNotifications: permission request failed', err);
    }
  }

  function handleDismiss() {
    setShowPrePrompt(false);
    // Mark primed so we don't show again. Fire-and-forget.
    SecureStore.setItemAsync(PRIMED_KEY, '1').catch(() => { });
  }

  useEffect(() => {
    if (!isAuthenticated) return;

    mountedRef.current = true;

    // Foreground notification handler — show in-app alert
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
        const { title, body } = notification.request.content;
        if (title && body) {
          confirm({
            title,
            message: body,
            confirmText: 'View',
            cancelText: 'Dismiss',
            onConfirm: () => router.push('/(tabs)/nudges'),
          });
        }
      });

    // Response handler — user taps push banner → navigate to nudges
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(() => {
        router.push('/(tabs)/nudges');
      });

    async function checkAndSetup() {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();

        if (status === 'granted') {
          // Already have permission — set up token immediately, no prompt needed.
          if (mountedRef.current) await doTokenSetup();
          return;
        }

        if (!canAskAgain) {
          // OS-level denied — we can't ask, silently skip.
          return;
        }

        // Check if the user has already seen our pre-prompt.
        const primed = await SecureStore.getItemAsync(PRIMED_KEY);
        if (!primed && mountedRef.current) {
          setShowPrePrompt(true);
        }
      } catch (err) {
        console.warn('usePushNotifications: setup error', err);
      }
    }

    checkAndSetup();

    return () => {
      mountedRef.current = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps



  return { showPrePrompt, handleAllow, handleDismiss };
}
