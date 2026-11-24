# 0013. MapLibre 6.19 worker and the geolocation permission

Date: 2026-11-24 · Status: accepted (F-10 build)

## Context
DESIGN D1/D11 planned `maplibre-gl` 6.12.0, whose worker imported a separate
`maplibre-gl-shared.mjs`. The current release (6.19.0, 2026-11-17) ships a standalone
`maplibre-gl-worker.mjs`; `maplibre-gl-shared.mjs` is still in `dist/` but empty. Its
`workerFactory` still starts a same-origin worker URL directly (`new Worker(url, { type: "module" })`)
and only uses `blob:` for cross-origin URLs, so D11's `worker-src 'self'` still holds.

The Template's Permissions-Policy turned geolocation off (`geolocation=()`), which would make
C-105's "Use my location" fail before the browser could ask.

## Decision
- Use `maplibre-gl` 6.19.0 (exact). `scripts/copy-maplibre-worker.mjs` copies only the worker to
  `public/vendor/maplibre/<version>/` (gitignored), before `dev` and `build`, and fails if it is
  missing. The map sets that URL with `setWorkerUrl` and reads the version with `getVersion()`.
- Permissions-Policy becomes `geolocation=(self)`: our own pages only, never a frame (D10).
  The browser still asks the user, and only after M-150 is pressed (NFR-3).

## Alternatives
- Pin 6.12.0 as planned: older, with no reason to prefer it.
- A `blob:` worker: needs `worker-src blob:`, which D11 rules out.

## Consequences
- An upgrade that brings back an imported chunk needs the copy script to copy it too; the map's
  e2e check (worker served from `/vendor/maplibre/…`, no CSP errors) catches that.
