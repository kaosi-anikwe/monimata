/**
 * Config plugin to wire SQLCipher into the Android build.
 *
 * SQLCipher ships a `libcrypto.so` for every ABI. Without `pickFirst` rules,
 * Gradle aborts with a duplicate-file error when merging native libs. This
 * plugin also adds the SQLCipher and required SQLite bridge dependencies.
 *
 * Applied during `expo prebuild` / `eas build`, so CI always gets the correct
 * Android output without manually editing generated Gradle files.
 */

const { withAppBuildGradle } = require("@expo/config-plugins");

// ---------------------------------------------------------------------------
// app/build.gradle
//   a) pickFirst rules for SQLCipher's libcrypto.so (one per ABI)
//   b) SQLCipher + SQLite bridge implementation dependencies
// ---------------------------------------------------------------------------
const withSQLCipher = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // ── a) packagingOptions pickFirst rules ─────────────────────────────────
    if (!contents.includes("lib/x86/libcrypto.so")) {
      const rules = [
        "pickFirst 'lib/x86/libcrypto.so'",
        "pickFirst 'lib/x86_64/libcrypto.so'",
        "pickFirst 'lib/armeabi-v7a/libcrypto.so'",
        "pickFirst 'lib/arm64-v8a/libcrypto.so'",
      ].join("\n            ");

      if (contents.includes("pickFirst '**/libc++_shared.so'")) {
        // Insert immediately after the libc++ rule added by withWatermelonDBJSI
        contents = contents.replace(
          "pickFirst '**/libc++_shared.so'",
          `pickFirst '**/libc++_shared.so'\n            // SQLCipher — one libcrypto.so per ABI; pick the first to avoid duplicates\n            ${rules}`,
        );
      } else if (contents.includes("jniLibs {")) {
        // Fallback: append inside the jniLibs block
        contents = contents.replace(
          /(jniLibs\s*\{)([\s\S]*?)([ \t]*\})/,
          (_, open, body, close) =>
            `${open}${body}            // SQLCipher libcrypto.so pickFirst rules\n            ${rules}\n${close}`,
        );
      }
    }

    // ── b) dependencies ─────────────────────────────────────────────────────
    if (!contents.includes("android-database-sqlcipher")) {
      const deps =
        `    // SQLCipher — AES-256 at-rest encryption for WatermelonDB\n` +
        `    implementation "net.zetetic:android-database-sqlcipher:4.5.4"\n` +
        `    // Required SQLite bridge for the SQLCipher adapter\n` +
        `    implementation "androidx.sqlite:sqlite:2.4.0"\n\n`;

      if (contents.includes("// WatermelonDB JSI")) {
        // Insert before the WatermelonDB JSI block added by withWatermelonDBJSI
        contents = contents.replace(
          /([ \t]*\/\/ WatermelonDB JSI)/,
          `${deps}    $1`,
        );
      } else {
        // Fallback: anchor on end of hermes/jsc conditional (inside dependencies {}).
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

module.exports = withSQLCipher;
