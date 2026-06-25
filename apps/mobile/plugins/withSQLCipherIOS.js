/**
 * Config plugin to wire SQLCipher into the iOS build for WatermelonDB.
 *
 * WatermelonDB's podspec links against the system `sqlite3` library. This plugin
 * modifies the generated Podfile to:
 *
 *   1. Add `pod 'SQLCipher'` as a dependency.
 *   2. Use a `pre_install` hook to remove 'sqlite3' from WatermelonDB's link
 *      libraries so it doesn't conflict with SQLCipher.
 *   3. Use a `post_install` hook to inject the required SQLCipher compiler
 *      defines into the WatermelonDB Xcode target.
 *
 * The encryptionKey is passed at runtime via database/index.ts — no changes
 * needed on the JS side once this plugin is applied.
 *
 * References:
 *   https://watermelondb.dev/docs/Installation#ios-installation
 *   https://www.zetetic.net/sqlcipher/sqlcipher-for-ios/
 */

const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// SQLCipher compiler defines required by WatermelonDB on iOS
const SQLCIPHER_FLAGS = [
  "-DHAVE_USLEEP=1",
  "-DSQLITE_HAS_CODEC",
  "-DSQLITE_TEMP_STORE=2",
  "-DSQLCIPHER_CRYPTO_CC",
  "-DNDEBUG",
].join(" ");

const withSQLCipherIOS = (config) =>
  withDangerousMod(config, [
    "ios",
    (mod) => {
      const podfilePath = path.join(
        mod.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      // ── 1. Add SQLCipher pod ───────────────────────────────────────────────
      if (!contents.includes("pod 'SQLCipher'")) {
        // Insert after the `use_react_native!` call
        contents = contents.replace(
          /(use_react_native!.*?\n)/s,
          `$1\n  # SQLCipher — AES-256 at-rest encryption for WatermelonDB\n  pod 'SQLCipher', :modular_headers => true\n`,
        );
      }

      // ── 2. pre_install — strip sqlite3 from WatermelonDB link libraries ───
      const preInstallBlock = `
        # SQLCipher: remove sqlite3 from WatermelonDB so SQLCipher's libsqlcipher is used instead
        pre_install do |installer|
          installer.pod_targets.each do |pod|
            if pod.name == 'WatermelonDB'
              def pod.build_type
                Pod::BuildType.static_library
              end
              pod.instance_variable_get(:@spec).libraries.delete('sqlite3')
            end
          end
        end
        `;
      if (!contents.includes("SQLCipher: remove sqlite3")) {
        // Insert before the first `target` block
        contents = contents.replace(
          /(^target .+? do)/m,
          `${preInstallBlock}\n$1`,
        );
      }

      // ── 3. post_install — inject SQLCipher compiler flags into WatermelonDB
      const flagsSnippet = `
        # SQLCipher: inject compiler defines into WatermelonDB target
        if target.name == 'WatermelonDB'
          target.build_configurations.each do |config|
            config.build_settings['OTHER_CFLAGS'] = '$(inherited) ${SQLCIPHER_FLAGS}'
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) ${SQLCIPHER_FLAGS}'
          end
        end`;

      if (!contents.includes("SQLCipher: inject compiler defines")) {
        if (contents.includes("post_install do |installer|")) {
          // Append inside existing post_install block
          contents = contents.replace(
            /(post_install do \|installer\|)([\s\S]*?)(^end)/m,
            (_, open, body, close) =>
              `${open}${body}  installer.pods_project.targets.each do |target|${flagsSnippet}\n  end\n${close}`,
          );
        } else {
          // Add a new post_install block before the last `end`
          const postInstallBlock = `
            post_install do |installer|
                installer.pods_project.targets.each do |target|${flagsSnippet}
                end
            end
            `;
          contents = contents.replace(/(\nend\s*$)/, `\n${postInstallBlock}$1`);
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return mod;
    },
  ]);

module.exports = withSQLCipherIOS;
