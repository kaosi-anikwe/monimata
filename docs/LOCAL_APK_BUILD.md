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

---

## Step 3 — Configure Gradle signing

### `apps/mobile/android/gradle.properties`

Add these lines at the bottom, substituting your actual passwords:

```properties
MYAPP_UPLOAD_STORE_FILE=../../monimata-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=monimata
MYAPP_UPLOAD_STORE_PASSWORD=yourpassword
MYAPP_UPLOAD_KEY_PASSWORD=yourpassword
```

> The path is relative to `android/app/`, so `../../` points back to `apps/mobile/` where the keystore lives.

### `apps/mobile/android/app/build.gradle`

Inside the `react { }` block, **uncomment** the `root` line (expo prebuild leaves it commented):

```groovy
react {
    // ...
    root = file("../../")   // ← uncomment this line
    // ...
}
```

`file("../../")` is resolved relative to `android/app/build.gradle`'s own directory, giving `apps/mobile/` — the correct project root. Without this, Gradle's default resolves relative to `android/` and walks up to the monorepo root instead, causing Metro to fail.

Also inside the `android { }` block, add a `signingConfigs` section and wire it into the `release` build type:

```groovy
android {
    // ... existing config ...

    signingConfigs {
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }

    buildTypes {
        release {
            // ... existing minifyEnabled etc. ...
            signingConfig signingConfigs.release   // ← add this line
        }
    }
}
```

Use a newer version of CMake (3.28+) to avoid Windows long path issues during the build:

```groovy
android {
    // ... existing config ...

    externalNativeBuild {
        cmake {
            version "3.30.3+"
        }
    }
}
```

---

## Step 4 — Build the release APK

```bash
cd apps/mobile/android
./gradlew assembleRelease
```

On Windows:

```powershell
cd apps\mobile\android
.\gradlew.bat assembleRelease
```

The first build downloads Gradle dependencies and takes ~5–10 minutes. Subsequent builds are faster.

---

## Step 5 — Find and distribute the APK

The signed APK is output to:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Share it via any file transfer method (WhatsApp, Google Drive, email, etc.).

Recipients must enable **"Install from unknown sources"** (or **"Install unknown apps"**) in their Android settings before installing.

---

## Security checklist

- [ ] `monimata-release.keystore` is **not** committed to git
- [ ] Passwords are **not** hardcoded in any committed file — if `gradle.properties` is tracked, move the password lines to a local `~/.gradle/gradle.properties` instead
- [ ] Store the keystore and passwords in a team password manager in case you need to re-sign a future release

---

## Re-building after code changes

If you only changed JavaScript/TypeScript:

```bash
cd apps/mobile/android
.\gradlew.bat assembleRelease
```

If you added/removed Expo plugins or changed `app.json` native fields, re-run prebuild first:

```bash
cd apps/mobile
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
```

> **Important:** `expo prebuild --clean` regenerates `android/app/build.gradle` and will comment out `root = file("../../")` again. After every clean prebuild, re-apply the Step 3 edit to `build.gradle` before building.

---

## Post-prebuild manual changes (required after every `prebuild --clean`)

`expo prebuild --clean` deletes and regenerates the entire `android/` folder. The following
changes must be re-applied manually every time after a clean prebuild. Keep this list in sync
if you add more native dependencies in the future.

### 1 · SQLCipher — `android/app/build.gradle`

SQLCipher provides AES-256 at-rest encryption for the WatermelonDB local database. It is not
an Expo module and cannot be auto-linked; the Gradle dependency must be added manually.

Find the `dependencies { }` block (near the bottom of the file) and add the two lines marked
with `// ← ADD`:

```groovy
dependencies {
    implementation("com.facebook.react:react-android")

    // ... gif/webp/hermes lines generated by prebuild, leave as-is ...

    // ← ADD: SQLCipher for WatermelonDB at-rest encryption
    implementation "net.zetetic:android-database-sqlcipher:4.5.4"
    // ← ADD: required SQLite bridge for SQLCipher adapter
    implementation "androidx.sqlite:sqlite:2.4.0"
}
```

### 2 · SQLCipher native library conflicts — `android/app/build.gradle`

SQLCipher ships `libcrypto.so` for each ABI. Without `pickFirst` rules, Gradle aborts with
`More than one file was found with OS independent path 'lib/arm64-v8a/libcrypto.so'`.

Find the `packagingOptions { jniLibs { ... } }` block and add the four `pickFirst` lines:

```groovy
packagingOptions {
    jniLibs {
        useLegacyPackaging false   // generated by prebuild, leave as-is
        // ← ADD: prevent libcrypto.so packaging conflicts from SQLCipher
        pickFirst 'lib/x86/libcrypto.so'
        pickFirst 'lib/x86_64/libcrypto.so'
        pickFirst 'lib/armeabi-v7a/libcrypto.so'
        pickFirst 'lib/arm64-v8a/libcrypto.so'
    }
}
```

### 3 · Summary checklist after each clean prebuild

After running `expo prebuild --platform android --clean`, tick these off before building:

- [ ] `root = file("../../")` uncommented in `react { }` block (Step 3 above)
- [ ] Signing config added to `android { signingConfigs }` and `buildTypes.release` (Step 3 above)
- [ ] SQLCipher dependencies added to `dependencies { }` (Post-prebuild step 1)
- [ ] SQLCipher `pickFirst` rules added to `packagingOptions.jniLibs { }` (Post-prebuild step 2)

> **Tip:** Consider using an [Expo config plugin](https://docs.expo.dev/guides/config-plugins/) to
> automate steps 1 and 2 so they survive prebuild automatically. A config plugin runs during
> prebuild and can patch `build.gradle` programmatically. Worth investing in once these manual
> steps become a recurring friction point.
