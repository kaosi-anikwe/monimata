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

import { useSelector } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import type { RootState } from '@/store';

/** Number of seconds in background before the app locks on return. */
const LOCK_AFTER_SECONDS = 5;

// ── Module-level enabled-flag store ──────────────────────────────────────────
// useBiometricLock() is called in multiple places (_layout.tsx, Profile screen,
// etc.).  Each call creates an independent React state, so a SecureStore write
// in one instance is invisible to the others until the app restarts.
// Storing the flag here and broadcasting changes to all subscribers ensures
// every instance stays in sync within the same JS session.

type EnabledListener = (enabled: boolean) => void;

/** Cache: `userId → enabled flag`.  null = not yet loaded from SecureStore. */
const _cache = new Map<string, boolean>();
const _listeners = new Set<EnabledListener>();

function _lockKey(userId: string) {
  return `mm_biometric_lock_enabled_v2_${userId}`;
}

async function _readEnabled(userId: string): Promise<boolean> {
  if (_cache.has(userId)) return _cache.get(userId)!;
  const raw = await SecureStore.getItemAsync(_lockKey(userId));
  const val = raw === 'true';
  _cache.set(userId, val);
  return val;
}

async function _writeEnabled(userId: string, val: boolean): Promise<void> {
  _cache.set(userId, val);
  await SecureStore.setItemAsync(_lockKey(userId), String(val));
  _listeners.forEach((l) => l(val));
}

function _subscribe(listener: EnabledListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

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
  const userId = useSelector((s: RootState) => s.auth.user?.id ?? '');
  const [isLocked, setIsLocked] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const backgroundTimestamp = useRef<number | null>(null);
  // True once we've applied the initial cold-start lock for this process
  // lifetime. Not reset on logout so that a password re-login doesn't
  // immediately re-show the lock screen.
  const hasLockedThisProcess = useRef(false);

  // Load device capability and user preference.  Re-runs when userId changes
  // so a different account login gets the correct setting immediately.
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    async function init() {
      const [enrolled, enabled] = await Promise.all([
        LocalAuthentication.isEnrolledAsync(),
        _readEnabled(userId),
      ]);
      if (!mounted) return;
      setIsEnrolled(enrolled);
      setIsEnabled(enabled);
    }
    init();
    // Subscribe to cross-instance changes (e.g. Profile screen toggles the
    // setting; _layout.tsx instance hears it immediately without a restart).
    const unsub = _subscribe((val) => { if (mounted) setIsEnabled(val); });
    return () => { mounted = false; unsub(); };
  }, [userId]);

  // Cold-start lock: fires once when all three conditions first become true
  // (session restored + biometric settings loaded). Covers the case where the
  // app is opened fresh from the task switcher / after being killed.
  useEffect(() => {
    if (isAuthenticated && isEnabled && isEnrolled && !hasLockedThisProcess.current) {
      hasLockedThisProcess.current = true;
      setIsLocked(true);
    }
  }, [isAuthenticated, isEnabled, isEnrolled]);

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
    if (!userId) return;
    if (!isEnabled) {
      // Require a successful auth before enabling — confirm biometrics work.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric lock',
        disableDeviceFallback: false,
      });
      if (!result.success) return;
    }
    const next = !isEnabled;
    // _writeEnabled saves to SecureStore AND notifies all hook instances.
    await _writeEnabled(userId, next);
    if (!next) setIsLocked(false);
  }

  return { isLocked, isEnrolled, isEnabled, unlock, toggleEnabled };
}
