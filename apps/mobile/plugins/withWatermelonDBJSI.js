/**
 * Config plugin to wire WatermelonDB's JSI C++ adapter into the Android build.
 *
 * Follows the official JSI installation guide:
 * https://watermelondb.dev/docs/Installation#jsi-installation-optional-recommended
 *
 * WatermelonDB's react-native.config.js only autolinks native/android (the async
 * Java bridge). The JSI module in native/android-jsi must be manually included.
 *
 * Applied during `expo prebuild` / `eas build`, so collaborators and CI always
 * get the correct Android output without manually editing generated files.
 */

const {
  withSettingsGradle,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// 1. settings.gradle — include the :watermelondb-jsi project
//    (monorepo: node_modules is 3 levels above android/ at the workspace root)
// ---------------------------------------------------------------------------
const withWatermelonSettings = (config) =>
  withSettingsGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(":watermelondb-jsi")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "include ':app'",
        `include ':app'\ninclude ':watermelondb-jsi'\nproject(':watermelondb-jsi').projectDir = new File(rootProject.projectDir, '../../../node_modules/@nozbe/watermelondb/native/android-jsi')`,
      );
    }
    return mod;
  });

// ---------------------------------------------------------------------------
// 2. app/build.gradle
//    a) pickFirst '**/libc++_shared.so' (required by official docs)
//    b) implementation project(':watermelondb-jsi')
// ---------------------------------------------------------------------------
const withWatermelonBuildGradle = (config) =>
  withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // a) libc++_shared.so: insert into existing jniLibs block
    if (!contents.includes("libc++_shared.so")) {
      if (contents.includes("jniLibs {")) {
        contents = contents.replace(
          /(jniLibs\s*\{)/,
          `$1\n            // Required by WatermelonDB JSI C++ bridge\n            pickFirst '**/libc++_shared.so'`,
        );
      } else if (contents.includes("packagingOptions {")) {
        contents = contents.replace(
          /(packagingOptions\s*\{)/,
          `$1\n        pickFirst '**/libc++_shared.so'`,
        );
      } else {
        contents = contents.replace(
          /(^dependencies\s*\{)/m,
          `packagingOptions {\n    pickFirst '**/libc++_shared.so'\n}\n\n$1`,
        );
      }
    }

    // b) implementation dependency
    if (!contents.includes("watermelondb-jsi")) {
      contents = contents.replace(
        /(\s*apply plugin: 'com\.google\.gms\.google-services')/,
        `\n    // WatermelonDB JSI C++ bridge — required for jsi: true in SQLiteAdapter.\n    implementation project(':watermelondb-jsi')\n$1`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });

// ---------------------------------------------------------------------------
// 3. proguard-rules.pro — prevent R8 from stripping JNI-called methods
// ---------------------------------------------------------------------------
const withWatermelonProguard = (config) =>
  withDangerousMod(config, [
    "android",
    (mod) => {
      const proguardPath = path.join(
        mod.modRequest.projectRoot,
        "android",
        "app",
        "proguard-rules.pro",
      );
      if (fs.existsSync(proguardPath)) {
        let contents = fs.readFileSync(proguardPath, "utf8");
        if (!contents.includes("com.nozbe.watermelondb")) {
          contents +=
            "\n# WatermelonDB JSI — prevent R8 from stripping JNI-called methods\n-keep class com.nozbe.watermelondb.** { *; }\n";
          fs.writeFileSync(proguardPath, contents, "utf8");
        }
      }
      return mod;
    },
  ]);

// ---------------------------------------------------------------------------
// 4. MainApplication.kt — import the package and register it
//
//    Official docs show overriding getJSIModulePackage() (old Java bridge API).
//    In RN 0.76+ New Architecture (Kotlin + bridgeless), that method is removed.
//    The modern equivalent is registering WatermelonDBJSIPackage as a normal
//    ReactPackage so NativeModules.WMDatabaseJSIBridge.install() is available
//    at runtime (what the WatermelonDB JS dispatcher calls on Android).
// ---------------------------------------------------------------------------
const withWatermelonMainApplication = (config) =>
  withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add import if not already present
    if (!contents.includes("WatermelonDBJSIPackage")) {
      // Insert after the last existing import block
      contents = contents.replace(
        /(import expo\.modules\.ExpoReactHostFactory)/,
        `$1\nimport com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage`,
      );
    }

    // Register the package if not already present
    if (!contents.includes("WatermelonDBJSIPackage()")) {
      // Insert add(WatermelonDBJSIPackage()) inside the .apply { } block
      contents = contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{[^}]*?)([\t ]*\/\/ add\(MyReactNativePackage\(\)\))/s,
        `$1$2\n          add(WatermelonDBJSIPackage())`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });

// ---------------------------------------------------------------------------
// Composite plugin
// ---------------------------------------------------------------------------
const withWatermelonDBJSI = (config) => {
  config = withWatermelonSettings(config);
  config = withWatermelonBuildGradle(config);
  config = withWatermelonProguard(config);
  config = withWatermelonMainApplication(config);
  return config;
};

module.exports = withWatermelonDBJSI;
