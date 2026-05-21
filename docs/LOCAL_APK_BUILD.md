# Building a Local Release APK for Android

Use this guide to build and share a signed APK with colleagues without going through EAS or the Play Store.

**Prerequisites:**

- Java 17 (OpenJDK) — verify with `java -version`
- Android SDK — verify that `$ANDROID_HOME` or `$ANDROID_SDK_ROOT` is set
- Node.js + npm installed

---

## Step 1 — Generate the `android/` folder

From the `apps/mobile` directory:

```bash
npx expo prebuild --platform android
```

This generates the native `android/` Gradle project. Re-run this any time you add or remove Expo plugins.

> **Note:** `android/` is git-ignored. You must run prebuild on every fresh clone before building.

---

## Step 2 — Generate a signing keystore (one-time)

Run once and store the keystore somewhere safe (e.g. a team password manager or a private S3 bucket). **Never commit it to the repo.**

```bash
keytool -genkeypair -v \
  -keystore monimata-release.keystore \
  -alias monimata \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You will be prompted for a keystore password and a key password. Keep these — you cannot re-sign previously distributed APKs without the same keystore.

Place the generated `monimata-release.keystore` at `apps/mobile/` (next to `package.json`).

---

## Step 3 — Add signing credentials to `android/gradle.properties`

Append these four lines to `apps/mobile/android/gradle.properties`, substituting your actual passwords:

```properties
MYAPP_UPLOAD_STORE_FILE=../../monimata-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=monimata
MYAPP_UPLOAD_STORE_PASSWORD=yourpassword
MYAPP_UPLOAD_KEY_PASSWORD=yourpassword
```

> The path is relative to `android/app/`, so `../../` resolves to `apps/mobile/` — where the keystore lives.

**Security:** if `android/gradle.properties` is ever tracked by git, move the four password lines to `~/.gradle/gradle.properties` on each developer's machine instead.

---

## Step 4 — Patch `android/app/build.gradle`

`expo prebuild` generates a working-but-incomplete `build.gradle`. Two manual patches
are still required; everything else (monorepo root, SQLCipher packaging options,
SQLCipher/WatermelonDB dependencies) is applied automatically by the project's
Expo config plugins.

### 4a — Add the release signing config

Prebuild wires `buildTypes.release` to the debug keystore. Add a `release` signing
config block and point `buildTypes.release` at it:

```groovy
signingConfigs {
    debug { ... }           // generated — leave as-is
    release {               // ← ADD
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release    // ← change from signingConfigs.debug
        // ... rest unchanged ...
    }
}
```

### 4b — Pin CMake version (required on Windows)

Add this block inside `android { }` to avoid Windows long-path failures during the
NDK build:

```groovy
externalNativeBuild {
    cmake {
        version "3.30.3+"
    }
}
```

### Complete target `android/app/build.gradle`

After both patches, the file should look exactly like this (the monorepo root,
SQLCipher packaging rules, and native dependencies are inserted automatically
by the config plugins during prebuild):

```groovy
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
    reactNativeDir = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()
    hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
    codegenDir = new File(["node", "--print", "require.resolve('@react-native/codegen/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()

    enableBundleCompression = (findProperty('android.enableBundleCompression') ?: false).toBoolean()
    cliFile = new File(["node", "--print", "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim())
    bundleCommand = "export:embed"

    root = file("../../")   // monorepo root — set automatically by withMonorepoRoot plugin

    autolinkLibrariesWithApp()
}

def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()
def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'ng.monimata'
    defaultConfig {
        applicationId 'ng.monimata'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "0.2.0"
        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\"${findProperty('reactNativeReleaseLevel') ?: 'stable'}\""
    }

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }

    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.release
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }

    packagingOptions {
        jniLibs {
            def enableLegacyPackaging = findProperty('expo.useLegacyPackaging') ?: 'false'
            useLegacyPackaging enableLegacyPackaging.toBoolean()
            pickFirst 'lib/x86/libcrypto.so'
            pickFirst 'lib/x86_64/libcrypto.so'
            pickFirst 'lib/armeabi-v7a/libcrypto.so'
            pickFirst 'lib/arm64-v8a/libcrypto.so'
            pickFirst '**/libc++_shared.so'
        }
    }

    androidResources {
        ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
    }

    externalNativeBuild {
        cmake {
            version "3.30.3+"
        }
    }
}

// Apply static packagingOptions from gradle.properties (pickFirsts / excludes / merges / doNotStrip)
["pickFirsts", "excludes", "merges", "doNotStrip"].each { prop ->
    def options = (findProperty("android.packagingOptions.$prop") ?: "").split(",")
    for (i in 0..<options.size()) options[i] = options[i].trim()
    options -= ""
    if (options.length > 0) {
        println "android.packagingOptions.$prop += $options ($options.length)"
        options.each { android.packagingOptions[prop] += it }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")

    def isGifEnabled = (findProperty('expo.gif.enabled') ?: "") == "true"
    def isWebpEnabled = (findProperty('expo.webp.enabled') ?: "") == "true"
    def isWebpAnimatedEnabled = (findProperty('expo.webp.animated') ?: "") == "true"

    if (isGifEnabled) {
        implementation("com.facebook.fresco:animated-gif:${expoLibs.versions.fresco.get()}")
    }
    if (isWebpEnabled) {
        implementation("com.facebook.fresco:webpsupport:${expoLibs.versions.fresco.get()}")
        if (isWebpAnimatedEnabled) {
            implementation("com.facebook.fresco:animated-webp:${expoLibs.versions.fresco.get()}")
        }
    }
    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    } else {
        implementation jscFlavor
    }

    // SQLCipher — AES-256 at-rest encryption for WatermelonDB
    implementation "net.zetetic:android-database-sqlcipher:4.5.4"
    implementation "androidx.sqlite:sqlite:2.4.0"

    // WatermelonDB JSI C++ bridge
    implementation project(':watermelondb-jsi')
}

apply plugin: 'com.google.gms.google-services'
```

---

## Step 5 — Build the release APK

```powershell
cd apps\mobile\android
.\gradlew.bat assembleRelease
```

On macOS/Linux:

```bash
cd apps/mobile/android
./gradlew assembleRelease
```

The first build downloads Gradle dependencies and takes ~5–10 minutes. Subsequent builds are faster.

---

## Step 6 — Find and distribute the APK

The signed APK is output to:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Share it via any file transfer method (WhatsApp, Google Drive, email, etc.).

Recipients must enable **"Install from unknown sources"** (or **"Install unknown apps"**) in their Android settings before installing.

---

## Step 7 — FCM setup for push notifications

Android push notifications require Firebase Cloud Messaging (FCM). Without valid FCM credentials, `expo-notifications` will register a device token but the Expo push service will silently fail to deliver any notifications to Android devices.

### 7a — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and create a project (or open the existing one).
2. Click **Add app** → select Android → enter package name `ng.monimata`.
3. Download the generated `google-services.json` and replace the placeholder at `apps/mobile/android/app/google-services.json`.

> `google-services.json` contains no secrets — it is safe to commit.

### 7b — Generate a service account key

FCM v1 (the current API) authenticates via a Google service account, not a legacy server key.

1. Firebase Console → **Project Settings** → **Service Accounts** tab.
2. Click **Generate new private key** → **Generate key**.
3. A JSON file downloads. **Do not commit this file.** Store it in the team password manager.

### 7c — Upload credentials to EAS

The Expo push service reads the service account key via EAS credentials. You must upload it even for local APK builds, because the backend routes Android notifications through Expo's infrastructure.

```bash
cd apps/mobile
eas credentials --platform android
```

Follow the prompts to upload the FCM V1 service account JSON file.

Alternatively, upload through [expo.dev](https://expo.dev) → your project → **Credentials** → **Android** → **FCM V1 Service Account Key**.

> **Full guide:** [docs.expo.dev/push-notifications/fcm-credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)

### 7d — Verify

Send a test notification from [expo.dev/notifications](https://expo.dev/notifications) using a device token from an Android device running the app. If it arrives, FCM is configured correctly.

---

## Security checklist

- [ ] `monimata-release.keystore` is **not** committed to git
- [ ] Signing passwords are **not** hardcoded in any committed file
- [ ] FCM service account JSON is **not** committed to git
- [ ] Keystore, passwords, and service account key are stored in the team password manager

---

## Re-building after code changes

**JS/TS changes only** — no prebuild needed:

```powershell
cd apps\mobile\android
.\gradlew.bat assembleRelease
```

**After adding/removing Expo plugins or changing `app.json` native fields:**

```powershell
cd apps\mobile
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
```

> ⚠️ `expo prebuild --clean` wipes and regenerates the entire `android/` folder. The two
> manual patches from Step 4 must be re-applied. Everything else is handled by the plugins.

---

## Post-prebuild patch checklist

After every `expo prebuild --platform android --clean`, tick these off before running `assembleRelease`:

- [ ] `signingConfigs.release` block added; `buildTypes.release` points to it
- [ ] `externalNativeBuild { cmake { version "3.30.3+" } }` block present _(Windows only)_

The following are applied automatically by Expo config plugins — no manual action needed:

- ✅ `root = file("../../")` uncommented (`withMonorepoRoot`)
- ✅ SQLCipher `pickFirst libcrypto.so` rules (`withSQLCipher`)
- ✅ SQLCipher + SQLite bridge dependencies (`withSQLCipher`)
- ✅ WatermelonDB JSI dependency + MainApplication registration (`withWatermelonDBJSI`)
