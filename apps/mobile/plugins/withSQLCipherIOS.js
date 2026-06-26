/**
 * Config plugin to wire SQLCipher into the iOS build for WatermelonDB.
 *
 * Modifies the generated Podfile to:
 *   1. Add `pod 'SQLCipher'` as a dependency.
 *   2. Inject SQLCipher compiler defines into the WatermelonDB Xcode target
 *      via a post_install hook.
 *
 * Note: The old pre_install `libraries.delete('sqlite3')` hack is omitted —
 * it broke on CocoaPods 1.16.x. SQLCipher 4.x is a full drop-in for sqlite3.
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
        // Insert after the closing `)` of the multi-line `use_react_native!(...)` call
        contents = contents.replace(
          /(use_react_native!\([\s\S]*?\))/,
          "$1\n\n  # SQLCipher — AES-256 at-rest encryption for WatermelonDB\n  pod 'SQLCipher', :modular_headers => true",
        );
      }

      // ── 2. post_install — inject SQLCipher compiler flags into WatermelonDB
      // Use line-by-line depth counting to find the post_install block's real
      // closing `end` (a simple "last end" regex breaks when other blocks like
      // ShareExtension appear after post_install in the Podfile).
      const targetsEachBlock = [
        "  # SQLCipher: inject compiler defines into WatermelonDB target",
        "  installer.pods_project.targets.each do |target|",
        "    if target.name == 'WatermelonDB'",
        "      target.build_configurations.each do |config|",
        "        config.build_settings['OTHER_CFLAGS'] = '$(inherited) " +
          SQLCIPHER_FLAGS +
          "'",
        "        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) " +
          SQLCIPHER_FLAGS +
          "'",
        // Point WatermelonDB's compiler at SQLCipher's sqlite3.h instead of the system one
        "        config.build_settings['HEADER_SEARCH_PATHS'] = '$(inherited) $(PODS_ROOT)/SQLCipher'",
        "      end",
        "    end",
        "  end",
      ].join("\n");

      if (!contents.includes("SQLCipher: inject compiler defines")) {
        if (contents.includes("post_install do |installer|")) {
          const lines = contents.split("\n");
          const startLine = lines.findIndex((l) =>
            l.trim().startsWith("post_install do"),
          );
          if (startLine !== -1) {
            let depth = 1;
            let closingLine = -1;
            for (let i = startLine + 1; i < lines.length; i++) {
              const t = lines[i].trim();
              if (
                /\bdo\s*(\|[^|]*\|)?\s*$/.test(t) ||
                /^(def|class|module|begin|case|if|unless|while|until|for)\b/.test(
                  t,
                )
              ) {
                depth++;
              }
              if (/^end\b/.test(t)) {
                depth--;
                if (depth === 0) {
                  closingLine = i;
                  break;
                }
              }
            }
            if (closingLine !== -1) {
              lines.splice(closingLine, 0, targetsEachBlock);
              contents = lines.join("\n");
            }
          }
        } else {
          // No post_install block yet — append one.
          contents =
            contents.trimEnd() +
            "\n\npost_install do |installer|\n" +
            targetsEachBlock +
            "\nend\n";
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return mod;
    },
  ]);

module.exports = withSQLCipherIOS;
