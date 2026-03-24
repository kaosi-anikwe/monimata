"use strict";
/**
 * Runs via Jest `setupFiles` — BEFORE jest-expo's setupFilesAfterFramework.
 *
 * Provides a safe no-op value for __ExpoImportMetaRegistry in case any code
 * path accesses it before the custom resolver has fully intercepted the expo
 * winter runtime stub. This is a belt-and-suspenders guard; the primary fix
 * is the custom resolver (expoRuntimeResolver.js) that replaces
 * expo/src/winter/runtime.native with an empty stub so no lazy getters are
 * installed at all.
 *
 * configurable: true so that expo's setup can overwrite it if needed.
 */
if (typeof globalThis.__ExpoImportMetaRegistry === "undefined") {
  Object.defineProperty(
    typeof global !== "undefined" ? global : globalThis,
    "__ExpoImportMetaRegistry",
    {
      value: { get: () => undefined, set: () => {}, has: () => false, url: "" },
      configurable: true,
      writable: true,
      enumerable: false,
    },
  );
}
