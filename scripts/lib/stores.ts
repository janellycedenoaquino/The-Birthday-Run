// Pure planning for the store import (BUILD F-9 "Operations", FR-43, metric 6, D9). No I/O here,
// so every rule is unit-tested; scripts/import-stores.ts does the fetching and writing.
// Scripts never import `@/` paths (BUILD §0.1): Node's type stripping can't resolve them.
import { z } from "zod";

export type Source = "atp" | "overture";

export type StoreRow = {
  retailerId: string;
  source: Source;
  sourceRef: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  state: string | null;
  lat: number;
  lng: number;
};

/** D9: Overture places below this confidence are dropped (tuned after the first coverage report). */
export const OVERTURE_MIN_CONFIDENCE = 0.7;

/** USPS codes kept in `state`: the 50 states, DC and the territories (BUILD F-9 edge cases). */
export const US_STATE_CODES = new Set(
  (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI AS MP"
  ).split(" "),
);

// ---------------------------------------------------------------------------------------------
// data/store-sources.csv (BUILD F-9 "Data")

export type StoreSource = {
  retailerId: string;
  atpSpiders: string[];
  wikidata: string | null;
  overtureBrandName: string | null;
};

const sourceRowSchema = z
  .object({
    retailer_id: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "not a retailer id"),
    atp_spiders: z
      .string()
      .regex(
        /^([a-z0-9_]+(;[a-z0-9_]+)*)?$/,
        "spiders are `;`-separated names",
      ),
    wikidata: z.string().regex(/^(Q\d+)?$/, "must be a Q… id or empty"),
    overture_brand_name: z.string().max(100),
  })
  .refine((r) => r.atp_spiders || r.wikidata || r.overture_brand_name, {
    message: "needs a spider, a wikidata id or an Overture brand name",
  });

const HEADER = "retailer_id,atp_spiders,wikidata,overture_brand_name";

/** Validates the CSV against the live retailer IDs; every problem names its row number. */
export function parseStoreSources(
  text: string,
  liveIds: ReadonlySet<string>,
): { ok: true; rows: StoreSource[] } | { ok: false; errors: string[] } {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l !== "");
  if (lines[0] !== HEADER)
    return { ok: false, errors: [`header must be: ${HEADER}`] };
  const errors: string[] = [];
  const rows: StoreSource[] = [];
  const seen = new Set<string>();
  const claimed = new Map<string, string>();
  lines.slice(1).forEach((line, i) => {
    const row = i + 2;
    // No quoting in this file: four plain fields (names with commas aren't needed).
    const cells = line.split(",");
    if (cells.length !== 4) {
      errors.push(`row ${row}: expected 4 fields, got ${cells.length}`);
      return;
    }
    const [retailer_id, atp_spiders, wikidata, overture_brand_name] = cells as [
      string,
      string,
      string,
      string,
    ];
    const parsed = sourceRowSchema.safeParse({
      retailer_id,
      atp_spiders,
      wikidata,
      overture_brand_name,
    });
    if (!parsed.success) {
      errors.push(
        `row ${row}: ${parsed.error.issues.map((x) => x.message).join("; ")}`,
      );
      return;
    }
    if (!liveIds.has(retailer_id)) {
      errors.push(`row ${row}: unknown or retired retailer_id ${retailer_id}`);
      return;
    }
    if (seen.has(retailer_id)) {
      errors.push(`row ${row}: ${retailer_id} listed twice`);
      return;
    }
    seen.add(retailer_id);
    // A spider, wikidata id or fallback name shared by two rows would hand one retailer's
    // stores to the other (the unique (source, source_ref) key keeps only one owner).
    for (const [kind, v] of [
      ...atp_spiders
        .split(";")
        .filter(Boolean)
        .map((x) => ["spider", x] as const),
      ["wikidata", wikidata] as const,
      ["Overture name", overture_brand_name.toLowerCase()] as const,
    ]) {
      if (!v) continue;
      const k = `${kind}:${v}`;
      if (claimed.has(k))
        errors.push(
          `row ${row}: ${kind} ${v} is already used by ${claimed.get(k)}`,
        );
      else claimed.set(k, retailer_id);
    }
    rows.push({
      retailerId: retailer_id,
      atpSpiders: atp_spiders ? atp_spiders.split(";") : [],
      wikidata: wikidata || null,
      overtureBrandName: overture_brand_name || null,
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}

// ---------------------------------------------------------------------------------------------
// Source mapping

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const validPoint = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const usState = (v: unknown): string | null => {
  const s = text(v)?.toUpperCase().replace(/^US-/, "") ?? null;
  return s && US_STATE_CODES.has(s) ? s : null;
};

export type AtpFeature = {
  id?: unknown;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
};

/**
 * One ATP GeoJSON feature → a store row, or null when it isn't a US store of this brand (BUILD
 * F-9 step 3). `wikidata` (when the CSV has one) filters spiders that cover several brands.
 */
export function normalizeAtp(
  feature: AtpFeature,
  retailerId: string,
  wikidata: string | null,
): StoreRow | null {
  const p = feature.properties ?? {};
  if (text(p["addr:country"])?.toUpperCase() !== "US") return null;
  if (wikidata && text(p["brand:wikidata"]) !== wikidata) return null;
  const ref =
    text(feature.id) ??
    (typeof feature.id === "number" ? String(feature.id) : null);
  const coords = feature.geometry?.coordinates;
  if (!ref || feature.geometry?.type !== "Point" || !Array.isArray(coords))
    return null;
  const [lng, lat] = coords as unknown[];
  if (!validPoint(lat, lng)) return null;
  const name = text(p.name) ?? text(p.brand);
  if (!name) return null;
  const street =
    text(p["addr:street_address"]) ??
    ([text(p["addr:housenumber"]), text(p["addr:street"])]
      .filter(Boolean)
      .join(" ") ||
      null);
  return {
    retailerId,
    source: "atp",
    sourceRef: ref,
    name,
    address: street,
    city: text(p["addr:city"]),
    postalCode: text(p["addr:postcode"]),
    state: usState(p["addr:state"]),
    lat,
    lng: lng as number,
  };
}

export type OvertureRow = {
  id: unknown;
  name: unknown;
  brand_wikidata: unknown;
  brand_name: unknown;
  freeform: unknown;
  locality: unknown;
  region: unknown;
  postcode: unknown;
  country: unknown;
  lat: unknown;
  lng: unknown;
  confidence: unknown;
  operating_status: unknown;
};

/**
 * One Overture place row → a store row for the matching retailer, or null (BUILD F-9 step 4):
 * US only, confidence ≥ 0.7, open, and matched by Wikidata id or the fallback brand name.
 */
export function normalizeOverture(
  row: OvertureRow,
  byWikidata: ReadonlyMap<string, string>,
  byName: ReadonlyMap<string, string>,
): StoreRow | null {
  if (text(row.country)?.toUpperCase() !== "US") return null;
  if (
    typeof row.confidence !== "number" ||
    row.confidence < OVERTURE_MIN_CONFIDENCE
  )
    return null;
  if ((text(row.operating_status) ?? "open") !== "open") return null;
  const wd = text(row.brand_wikidata);
  const brand = text(row.brand_name)?.toLowerCase();
  const retailerId =
    (wd && byWikidata.get(wd)) ?? (brand && byName.get(brand)) ?? null;
  if (!retailerId) return null;
  const ref = text(row.id);
  if (!ref || !validPoint(row.lat, row.lng)) return null;
  const name = text(row.name) ?? text(row.brand_name);
  if (!name) return null;
  return {
    retailerId,
    source: "overture",
    sourceRef: ref,
    name,
    address: text(row.freeform),
    city: text(row.locality),
    postalCode: text(row.postcode),
    state: usState(row.region),
    lat: row.lat as number,
    lng: row.lng as number,
  };
}

// ---------------------------------------------------------------------------------------------
// Planning and the coverage report (metric 6)

export type PlanAction = "replace" | "keep-last-good" | "none";
export type PlanEntry = {
  retailerId: string;
  source: Source;
  action: PlanAction;
  fetched: number;
  existing: number;
};

const key = (retailerId: string, source: Source) => `${retailerId}|${source}`;

/**
 * FR-43: per (retailer, source) a non-empty fetch replaces the stored rows; an empty one keeps
 * the last good rows (a broken spider never empties a brand); nothing either way is "none".
 */
export function planReplace(
  sources: readonly StoreSource[],
  sourcesRun: readonly Source[],
  existingCounts: ReadonlyMap<string, number>,
  fetched: readonly StoreRow[],
  /** `retailer|source` keys where any part failed (a spider 404s): keep last good if stored. */
  failed: ReadonlySet<string> = new Set(),
): PlanEntry[] {
  const counts = new Map<string, number>();
  for (const r of fetched)
    counts.set(
      key(r.retailerId, r.source),
      (counts.get(key(r.retailerId, r.source)) ?? 0) + 1,
    );
  const plan: PlanEntry[] = [];
  for (const s of sources)
    for (const source of sourcesRun) {
      const k = key(s.retailerId, source);
      const n = counts.get(k) ?? 0;
      const existing = existingCounts.get(k) ?? 0;
      plan.push({
        retailerId: s.retailerId,
        source,
        fetched: n,
        existing,
        action:
          failed.has(k) && existing > 0
            ? "keep-last-good"
            : n > 0
              ? "replace"
              : existing > 0
                ? "keep-last-good"
                : "none",
      });
    }
  return plan;
}

export type CoverageLine = {
  retailerId: string;
  atp: number;
  overture: number;
  stored: number;
  status: "matched" | "kept-last-good" | "missing";
};

/** Metric 6: per retailer, what the run found and what stays stored; totals at the end. */
export function coverage(plan: readonly PlanEntry[]): {
  lines: CoverageLine[];
  withStores: number;
  total: number;
} {
  const by = new Map<string, CoverageLine>();
  for (const e of plan) {
    const line = by.get(e.retailerId) ?? {
      retailerId: e.retailerId,
      atp: 0,
      overture: 0,
      stored: 0,
      status: "missing" as CoverageLine["status"],
    };
    line[e.source] = e.fetched;
    line.stored += e.action === "replace" ? e.fetched : e.existing;
    if (e.action === "replace") line.status = "matched";
    else if (e.action === "keep-last-good" && line.status !== "matched")
      line.status = "kept-last-good";
    by.set(e.retailerId, line);
  }
  const lines = [...by.values()].sort((a, b) =>
    a.retailerId.localeCompare(b.retailerId),
  );
  return {
    lines,
    withStores: lines.filter((l) => l.stored > 0).length,
    total: lines.length,
  };
}

/** The report text saved in RESEARCH.md (metric 6). */
export function formatCoverage(c: ReturnType<typeof coverage>): string {
  const rows = c.lines.map(
    (l) =>
      `| ${l.retailerId} | ${l.atp} | ${l.overture} | ${l.stored} | ${l.status} |`,
  );
  return [
    "| retailer | ATP | Overture | stored | status |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `≥1 US store: ${c.withStores} of ${c.total}`,
  ].join("\n");
}
