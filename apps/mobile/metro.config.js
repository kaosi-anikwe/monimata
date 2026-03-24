const path = require("path");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */

// apps/mobile
const projectRoot = __dirname;
// monimata-clone (workspace root)
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

// Expo's getDefaultConfig auto-detects the monorepo root as the Metro
// "server root" (unstable_serverRoot). The React Native Gradle Plugin computes
// the --entry-file path relative to `root` (apps/mobile/), but Expo CLI
// resolves that relative path from the server root rather than from projectRoot.
// In a monorepo, this makes the relative path escape the repo root. Pinning the
// server root to projectRoot (apps/mobile/) keeps all relative path maths aligned.
config.server = { ...config.server, unstable_serverRoot: projectRoot };

// Watch the entire monorepo so Metro sees changes in shared libs
config.watchFolders = [monorepoRoot];

// Resolve packages from the app first, then fall back to the hoisted
// workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// In dev mode, Metro derives the bundle entry from the URL path and resolves it
// as "./node_modules/pkg/..." relative to unstable_serverRoot (= projectRoot).
// Since packages are hoisted to monorepoRoot, this relative path doesn't exist
// in apps/mobile/node_modules/. Intercept these paths and rewrite them as bare
// module names so nodeModulesPaths is consulted and the hoisted package is found.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.startsWith("./node_modules/") ||
    moduleName.startsWith("node_modules/")
  ) {
    const bareName = moduleName.replace(/^(\.\/)?node_modules\//, "");
    return context.resolveRequest(context, bareName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// NOTE: withSentryConfig (Metro source-map injection) is intentionally NOT used here.
// It conflicts with the monorepo custom resolveRequest above, causing a
// "Cannot read properties of undefined (reading 'match')" crash in the Sentry
// serializer during release bundling.
//
// Sentry error/crash reporting works without it — withSentryConfig only adds
// debug IDs to bundles for source-map correlation in the Sentry dashboard.
// To enable source map uploads for production releases, add it back via the
// Sentry wizard (npx @sentry/wizard@latest -i reactNative) which sets up a
// dedicated upload step in your CI pipeline instead of hooking into Metro.
module.exports = config;