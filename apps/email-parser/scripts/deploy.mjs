#!/usr/bin/env node
// Cross-platform deploy script: wrangler deploy + Sentry source map upload.
// Replaces bash-only shell commands in package.json scripts.

import { execSync } from "child_process";

const ORG = "desktop-technologies-limited";
const PROJECT = "monimata-parser";

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

// 1. Resolve the release version (git SHA or version string)
const release = execSync("sentry-cli releases propose-version", {
  encoding: "utf8",
}).trim();
console.log(`Release: ${release}`);

// 2. Deploy the worker, embedding the release version as a var
run(
  `wrangler deploy --outdir dist --upload-source-maps --var SENTRY_RELEASE:${release}`,
);

// 3. Register the release in Sentry
run(`sentry-cli releases new ${release} --org=${ORG} --project=${PROJECT}`);

// 4. Upload source maps
run(
  `sentry-cli sourcemaps upload --org=${ORG} --project=${PROJECT} --release=${release} --strip-prefix dist/.. dist`,
);

console.log("Deploy + source map upload complete.");
