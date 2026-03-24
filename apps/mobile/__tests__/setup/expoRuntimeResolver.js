"use strict";
/**
 * Custom Jest resolver that redirects expo's runtime.native.ts to a no-op stub.
 *
 * expo/src/winter/runtime.native.ts installs lazy getters (structuredClone, URL,
 * TextDecoder, __ExpoImportMetaRegistry, etc.) using installGlobal().
 * In Jest, those lazy getters fire inside property-accessor callbacks, which
 * jest-runtime classifies as "outside test scope" and throws ReferenceError.
 *
 * By replacing runtime.native.ts with a stub that exports nothing, we skip all
 * the lazy-getter installs while letting jest-expo's setup.js run normally.
 * Node 17+ already provides structuredClone natively; unit tests do not rely
 * on the Expo WinterCG polyfills.
 */
const path = require("path");

module.exports = (moduleName, options) => {
  // Intercept expo's internal runtime import from expo/src/winter/index.ts
  if (
    (moduleName === "./runtime" || moduleName === "./runtime.native") &&
    options.basedir &&
    options.basedir.replace(/\\/g, "/").includes("expo/src/winter")
  ) {
    return path.resolve(__dirname, "../../__mocks__/expoWinterRuntime.js");
  }

  return options.defaultResolver(moduleName, options);
};
