/**
 * Config plugin to fix the monorepo project root in the generated Android build.
 *
 * `expo prebuild` generates `react { }` in `android/app/build.gradle` with the
 * monorepo root line commented out:
 *
 *   // root = file("../../")
 *
 * Without this line, Metro resolves module paths relative to `android/` rather
 * than the mobile app workspace root (`apps/mobile/`), causing bundling to fail.
 *
 * This plugin uncomments the line so it is active after every prebuild.
 */

const { withAppBuildGradle } = require("@expo/config-plugins");

const withMonorepoRoot = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Already uncommented — nothing to do.
    if (/^\s*root\s*=\s*file\(/m.test(contents)) return mod;

    // Uncomment the line however it was generated.
    const uncommented = contents.replace(
      /([ \t]*)\/\/\s*(root\s*=\s*file\([^)]+\))/,
      "$1$2   // monorepo root",
    );

    if (uncommented !== contents) {
      mod.modResults.contents = uncommented;
      return mod;
    }

    // Line is absent entirely — insert after `bundleCommand` inside react { }.
    mod.modResults.contents = contents.replace(
      /(bundleCommand\s*=\s*"export:embed")/,
      '$1\n\n    root = file("../../")   // monorepo root',
    );

    return mod;
  });

module.exports = withMonorepoRoot;
