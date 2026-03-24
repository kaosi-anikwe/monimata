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
 * database/encryption.ts
 *
 * Manages the WatermelonDB SQLCipher encryption key lifecycle.
 *
 * --- HOW IT WORKS ---
 * 1. On first app install, generate a 256-bit random key.
 * 2. Store the key in the OS secure keychain (iOS Keychain / Android Keystore)
 *    via expo-secure-store, so it is never written to unencrypted storage.
 * 3. Pass the key to the SQLiteAdapter's encryptionKey option (native SQLCipher).
 *
 * --- CURRENT STATE ---
 * The JS side (key generation, SecureStore, init) is fully implemented.
 * To enable actual at-rest encryption, the following native steps are also needed:
 *
 * ANDROID — android/app/build.gradle:
 *   dependencies {
 *     implementation "net.zetetic:android-database-sqlcipher:4.5.4"
 *     implementation "androidx.sqlite:sqlite:2.3.1"
 *   }
 *   Then pass `encryptionKey` to the SQLiteAdapter in database/index.ts (see comment there).
 *
 * iOS — coming when Xcode/Mac build support is added.
 *   CocoaPods or SPM: SQLCipher from https://www.zetetic.net/sqlcipher/ios-tutorial/
 *   Then pass `encryptionKey` to the SQLiteAdapter in database/index.ts.
 *
 * --- SECURITY PROPERTIES ---
 * - Key is generated using Web Crypto (globalThis.crypto.getRandomValues), available
 *   in React Native >= 0.71 (Hermes). This project uses RN 0.83.2.
 * - Key is 32 bytes (256 bits), hex-encoded to a 64-char string.
 * - expo-secure-store uses biometric-protected hardware-backed Keystore on Android >= 6,
 *   and iOS Secure Enclave via Keychain with kSecAttrAccessibleAfterFirstUnlock.
 * - requireAuthentication: false — the DB key should be accessible without biometrics
 *   (the app-level biometric lock in useBiometricLock.ts is a separate, user-facing layer).
 */

import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DB_KEY_STORAGE_ID = 'mm_wdb_encryption_key_v1';

function generateKey(): string {
  // expo-crypto uses the native crypto provider (Keystore / SecEncureRandom)
  // and works on Hermes where globalThis.crypto.getRandomValues is unavailable.
  const bytes = ExpoCrypto.getRandomBytes(32);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Retrieves the local DB encryption key, generating and persisting it on first call.
 * Call this once during app init (before WatermelonDB opens the database).
 *
 * @returns A 64-character hex string suitable for use as a SQLCipher PRAGMA key.
 */
// Module-level cache so the key is only read from SecureStore once per session.
let _cachedKey: string | null = null;

export async function getOrCreateDbKey(): Promise<string> {
  if (_cachedKey) return _cachedKey;
  let key = await SecureStore.getItemAsync(DB_KEY_STORAGE_ID);
  if (!key) {
    key = generateKey();
    await SecureStore.setItemAsync(DB_KEY_STORAGE_ID, key, {
      // Keys must be readable after device unlock — don't require biometrics.
      // The biometric app-lock layer is separate (see hooks/useBiometricLock.ts).
      requireAuthentication: false,
    });
  }
  _cachedKey = key;
  return key;
}

/**
 * Initialises the DB encryption key on app startup.
 * Idempotent — safe to call multiple times.
 */
export async function initDbEncryptionKey(): Promise<void> {
  await getOrCreateDbKey();
}

/**
 * Wipes the stored encryption key.
 *
 * WARNING: After calling this, the SQLite database CANNOT be decrypted.
 * Use only on account deletion / full data wipe flows.
 */
export async function clearDbKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DB_KEY_STORAGE_ID);
}
