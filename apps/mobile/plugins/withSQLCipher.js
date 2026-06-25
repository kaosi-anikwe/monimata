/**
 * Config plugin to wire SQLCipher into the Android build.
 *
 * Uses net.zetetic:sqlcipher-android (the actively maintained replacement for
 * the deprecated android-database-sqlcipher). The new library statically links
 * LibTomCrypt so there is no separate libcrypto.so to deduplicate.
 *
 * Changes applied during `expo prebuild` / `eas build`:
 *   1. app/build.gradle — add sqlcipher-android + androidx.sqlite dependencies
 *   2. MainApplication.kt — load the native sqlcipher library before any DB open
 *
 * Applied during `expo prebuild` / `eas build`, so CI always gets the correct
 * Android output without manually editing generated Gradle files.
 */

const {
  withAppBuildGradle,
  withMainApplication,
} = require("@expo/config-plugins");

// ---------------------------------------------------------------------------
// 1. app/build.gradle — sqlcipher-android + androidx.sqlite dependencies
// ---------------------------------------------------------------------------
const withSQLCipherBuildGradle = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (
      !contents.includes("sqlcipher-android") &&
      !contents.includes("android-database-sqlcipher")
    ) {
      const deps =
        `    // SQLCipher — AES-256 at-rest encryption for WatermelonDB\n` +
        `    implementation 'net.zetetic:sqlcipher-android:4.16.0@aar'\n` +
        `    // Required SQLite bridge for the SQLCipher adapter\n` +
        `    implementation 'androidx.sqlite:sqlite:2.6.2'\n\n`;

      if (contents.includes("// WatermelonDB JSI")) {
        contents = contents.replace(
          /([ \t]*\/\/ WatermelonDB JSI)/,
          `${deps}    $1`,
        );
      } else {
        const withDep = contents.replace(
          /([ \t]*implementation jscFlavor\n[ \t]*\})/,
          `$1\n\n${deps.trimEnd()}`,
        );
        contents =
          withDep !== contents
            ? withDep
            : contents.replace(
                /([ \t]*implementation\("com\.facebook\.react:hermes-android"\)\n[ \t]*\})/,
                `$1\n\n${deps.trimEnd()}`,
              );
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });

// ---------------------------------------------------------------------------
// 2. MainApplication.kt — System.loadLibrary("sqlcipher") before DB opens
//    The new sqlcipher-android library no longer auto-loads its native lib;
//    it must be loaded explicitly before any SQLiteDatabase call.
// ---------------------------------------------------------------------------
const withSQLCipherMainApplication = (config) =>
  withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes(`loadLibrary("sqlcipher")`)) {
      // Insert as the first statement inside onCreate(), before super.onCreate()
      contents = contents.replace(
        /(override fun onCreate\(\) \{)/,
        `$1\n    System.loadLibrary("sqlcipher")`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });

// ---------------------------------------------------------------------------
// Composite plugin
// ---------------------------------------------------------------------------
const withSQLCipher = (config) => {
  config = withSQLCipherBuildGradle(config);
  config = withSQLCipherMainApplication(config);
  return config;
};

module.exports = withSQLCipher;
