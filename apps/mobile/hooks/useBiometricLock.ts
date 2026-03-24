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
 * hooks/useBiometricLock.ts
 *
 * Manages the biometric app-lock lifecycle.
 *
 * Lock triggers:
 *  - App goes to background/inactive AND returns to active after >= 30 seconds.
 *
 * Unlock:
 *  - expo-local-authentication Face ID / fingerprint prompt.
 *  - OS fallback PIN/pattern if biometrics fail or are unavailable.
 *
 * Settings:
 *  - Users enable/disable via Profile → Biometric Lock.
 *  - Enabling requires a successful biometric auth to confirm the user actually
 *    has working biometrics.
 *  - Setting is persisted in expo-secure-store.
 *  - The lock is only active if BOTH `isEnabled` AND `isEnrolled` are true.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSelector } from 'react-redux';

import type { RootState } from '@/store';

const LOCK_ENABLED_KEY = 'mm_biometric_lock_enabled_v1';
/** Number of seconds in background before the app locks on return. */
const LOCK_AFTER_SECONDS = 30;

export interface BiometricLockState {
  /** True when the lock screen should be shown. */
  isLocked: boolean;
  /** True if the device has at least one enrolled biometric (Face ID / fingerprint). */
  isEnrolled: boolean;
  /** True if the user has enabled biometric lock in their settings. */
  isEnabled: boolean;
  /** Prompts the OS biometric dialog. Returns true on success. */
  unlock: () => Promise<boolean>;
  /** Toggles isEnabled. Requires a successful biometric auth to enable. */
  toggleEnabled: () => Promise<void>;
}

export function useBiometricLock(): BiometricLockState {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const [isLocked, setIsLocked] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const backgroundTimestamp = useRef<number | null>(null);

  // Check device capability and user preference on mount.
  useEffect(() => {
    async function init() {
      const [enrolled, enabledStr] = await Promise.all([
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(LOCK_ENABLED_KEY),
      ]);
      setIsEnrolled(enrolled);
      setIsEnabled(enabledStr === 'true');
    }
    init();
  }, []);

  // Watch AppState to lock after background timeout.
  useEffect(() => {
    if (!isAuthenticated || !isEnabled || !isEnrolled) {
      backgroundTimestamp.current = null;
      return;
    }

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimestamp.current = Date.now();
      } else if (nextState === 'active') {
        if (backgroundTimestamp.current !== null) {
          const elapsed = (Date.now() - backgroundTimestamp.current) / 1000;
          if (elapsed >= LOCK_AFTER_SECONDS) {
            setIsLocked(true);
          }
        }
        backgroundTimestamp.current = null;
      }
    });

    return () => sub.remove();
  }, [isAuthenticated, isEnabled, isEnrolled]);

  // Clear lock state when the user logs out.
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLocked(false);
      backgroundTimestamp.current = null;
    }
  }, [isAuthenticated]);

  async function unlock(): Promise<boolean> {
    if (!isEnrolled) return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access MoniMata',
      fallbackLabel: 'Use device PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      setIsLocked(false);
    }
    return result.success;
  }

  async function toggleEnabled(): Promise<void> {
    if (!isEnabled) {
      // Require a successful auth before enabling — confirm biometrics work.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric lock',
        disableDeviceFallback: false,
      });
      if (!result.success) return;
    }
    const next = !isEnabled;
    await SecureStore.setItemAsync(LOCK_ENABLED_KEY, String(next));
    setIsEnabled(next);
    if (!next) setIsLocked(false);
  }

  return { isLocked, isEnrolled, isEnabled, unlock, toggleEnabled };
}
