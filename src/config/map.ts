// Map hosts and style (BUILD F-10, D11). Code constants, not env: the CSP reads MAP_HOSTS, so
// changing the tile host is a reviewed code change (DESIGN T-112). No key exists (NFR-4).

/** OpenFreeMap's "liberty" style: its tiles, glyphs and sprites are all on the same host. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** The only hosts the map may fetch from (CSP connect-src and img-src). */
export const MAP_HOSTS = ["https://tiles.openfreemap.org"] as const;

/**
 * The MapLibre worker, copied same-origin at build (scripts/copy-maplibre-worker.mjs), so
 * `worker-src 'self'` holds and no `blob:` worker is needed (D11).
 */
export const maplibreWorkerPath = (version: string) =>
  `/vendor/maplibre/${version}/maplibre-gl-worker.mjs`;
