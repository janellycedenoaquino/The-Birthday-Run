// Copies MapLibre's worker to public/vendor/maplibre/<version>/ so it is served same-origin and
// `worker-src 'self'` holds (BUILD F-10, D11, decision 0013). Runs before `dev` and `build`.
// Fails if the worker is missing, or imports another chunk: either would only break in the
// browser.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const dist = join(dirname(pkgPath), "dist");
const vendorDir = resolve(
  import.meta.dirname,
  "..",
  "public",
  "vendor",
  "maplibre",
);
const outDir = join(vendorDir, version);

const FILES = ["maplibre-gl-worker.mjs"];
const fail = (message) => {
  console.error(`copy-maplibre-worker: ${message}`);
  process.exit(1);
};

for (const file of FILES) {
  const from = join(dist, file);
  if (!existsSync(from) || statSync(from).size === 0)
    fail(`${file} missing or empty in maplibre-gl ${version}`);
  const relative = readFileSync(from, "utf8").match(
    /(?:from|import)\s*\(?\s*["']\.\.?\/[^"']+["']/,
  );
  if (relative)
    fail(`${file} imports ${relative[0]}; copy that chunk too (decision 0013)`);
}

// Only the installed version is served: old version folders go.
rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const file of FILES) copyFileSync(join(dist, file), join(outDir, file));
console.log(
  `copy-maplibre-worker: ${FILES.join(", ")} → public/vendor/maplibre/${version}/`,
);
