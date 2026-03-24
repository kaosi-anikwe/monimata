// jest.config.js
// Uses jest-expo preset which handles Expo/React Native transforms automatically.
module.exports = {
  preset: "jest-expo",
  // Custom resolver that redirects expo/src/winter/runtime.native to a no-op stub,
  // preventing lazy getters (structuredClone, __ExpoImportMetaRegistry, etc.) from
  // firing inside jest-runtime property-accessor callbacks ("outside scope" error).
  resolver: "./__tests__/setup/expoRuntimeResolver.js",
  // setupFiles runs BEFORE jest-expo's setupFilesAfterFramework.
  setupFiles: ["./__tests__/setup/preSetup.js"],
  moduleNameMapper: {
    // Map the @/* path alias defined in tsconfig.json
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
  // Full expo/react-native transform list (per jest-expo recommendation).
  // Everything inside expo and react-native needs to be transpiled by Babel
  // because these packages ship source (not pre-compiled CJS).
  transformIgnorePatterns: [
    "node_modules/(?!(" +
      "jest-)?react-native|" +
      "@react-native(-community)?|" +
      "expo(nent)?|" +
      "@expo(nent)?/.*|" +
      "@sentry/.*|" +
      "@shopify/flash-list|" +
      "@nozbe/watermelondb|" +
      "@tanstack/react-query" +
      ")",
  ],
  collectCoverageFrom: [
    "utils/**/*.ts",
    "store/**/*.ts",
    "hooks/**/*.ts",
    "!**/*.d.ts",
  ],
};
