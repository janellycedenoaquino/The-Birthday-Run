// Copies MapLibre's worker to public/vendor/maplibre/<version>/ so it is served same-origin and
// `worker-src 'self'` holds (BUILD F-10, D11, decision 0013). Runs before `dev` and `build`.
// Fails if the worker is missing: a map without its worker would only fail in the browser.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const dist = join(dirname(pkgPath), "dist");
const outDir = resolve(
  import.meta.dirname,
  "..",
  "public",
  "vendor",
  "maplibre",
  version,
);

const FILES = ["maplibre-gl-worker.mjs"];
mkdirSync(outDir, { recursive: true });
for (const file of FILES) {
  const from = join(dist, file);
  if (!existsSync(from) || statSync(from).size === 0) {
    console.error(
      `copy-maplibre-worker: ${file} missing or empty in maplibre-gl ${version}`,
    );
    process.exit(1);
  }
  copyFileSync(from, join(outDir, file));
}
console.log(
  `copy-maplibre-worker: ${FILES.join(", ")} → public/vendor/maplibre/${version}/`,
);
