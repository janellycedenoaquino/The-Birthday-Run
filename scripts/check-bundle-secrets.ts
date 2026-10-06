// Fails if a secret reached the browser (NFR-4, D6, BUILD F-2). Run after `next build`:
//   npm run check:bundle
// Scans every file the browser can receive: the client bundle (.next/static) and the
// prerendered output (.next/server: .html, .rsc including segments, .body).
// 1. The actual values of the secrets below, loaded exactly as Next loads them
//    (process env, then .env* files, via @next/env). Values under 8 characters are skipped.
// 2. Secret-key shapes: a Supabase secret key, and a legacy service_role JWT.
// Prints variable names and file paths only, never values. Exit 1 on a hit, 2 on a setup error.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const SECRETS = [
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "SENTRY_AUTH_TOKEN",
  "RATE_LIMIT_HMAC_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "SUPABASE_DB_URL",
];
const PATTERNS: [string, RegExp][] = [
  // A real key, not the bare prefix: the env schema itself contains "sb_secret_".
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  // `"role":"service_role"` inside a JWT payload, base64url-encoded at each of the 3 alignments.
  [
    "service_role JWT",
    /InJvbGUiOiJzZXJ2aWNlX3JvbGU|yb2xlIjoic2VydmljZV9yb2xl|cm9sZSI6InNlcnZpY2Vfcm9sZ/,
  ],
];

const fail = (message: string, code: number): never => {
  console.error(`check-bundle-secrets: ${message}`);
  process.exit(code);
};

function walk(dir: string, keep: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, keep);
    return entry.isFile() && keep(path) ? [path] : [];
  });
}

try {
  if (!statSync(".next/static").isDirectory()) throw new Error();
} catch {
  fail("no .next/static; run `npm run build` first.", 2);
}
const files = [
  ...walk(".next/static", () => true),
  ...walk(".next/server", (file) => /\.(html|rsc|body)$/.test(file)),
];
if (files.length === 0)
  fail("no files to scan in .next; did the build finish?", 2);

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });

const checked: string[] = [];
const skipped: string[] = [];
const needles: [string, (text: string) => boolean][] = [];
for (const name of SECRETS) {
  const value = process.env[name]?.trim() ?? "";
  if (value.length < 8) {
    skipped.push(name);
    continue;
  }
  checked.push(name);
  needles.push([name, (text) => text.includes(value)]);
}
for (const [label, pattern] of PATTERNS)
  needles.push([label, (text) => pattern.test(text)]);

let hits = 0;
for (const file of files) {
  const text = readFileSync(file, "latin1");
  for (const [label, found] of needles) {
    if (found(text)) {
      console.error(`check-bundle-secrets: ${label} found in ${file}`);
      hits++;
    }
  }
}

console.log(
  `check-bundle-secrets: scanned ${files.length} files for ${checked.length} secret values` +
    (checked.length ? ` (${checked.join(", ")})` : "") +
    ` and ${PATTERNS.length} key patterns.` +
    (skipped.length
      ? ` Not set here, so not checked: ${skipped.join(", ")}.`
      : ""),
);
if (hits) {
  fail(
    "FAILED. A secret is in files sent to the browser; rotate it if this build was deployed.",
    1,
  );
}
console.log("check-bundle-secrets: OK");
