// Imports US store locations for the listed brands from All The Places and Overture Places into
// public.retailer_stores (BUILD F-9 `import:stores`, FR-43, metric 6, D9). Runs on Node's type
// stripping, as the database owner:
//   npm run import:stores                                  # local Supabase
//   npm run import:stores -- --target=production           # needs SUPABASE_DB_URL
// Flags: --only=<id,…>, --source=atp|overture|all (default all), --dry-run (fetch and report,
// write nothing), --report=<file> (also write the coverage table there).
// Test flags: --atp-base=<dir> (latest.json + output/<spider>.geojson), --overture-file=<json>.
// Only public files are fetched; no user data leaves (FR-43).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import {
  coverage,
  formatCoverage,
  normalizeAtp,
  normalizeOverture,
  OVERTURE_MIN_CONFIDENCE,
  parseStoreSources,
  planReplace,
  type AtpFeature,
  type OvertureRow,
  type Source,
  type StoreRow,
  type StoreSource,
} from "./lib/stores.ts";

export const LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const ATP_INDEX = "https://data.alltheplaces.xyz/runs/latest.json";
const ATP_OUTPUT = "https://alltheplaces-data.openaddresses.io/runs";
const OVERTURE_CATALOG = "https://stac.overturemaps.org/catalog.json";
const UA = { "user-agent": "the-birthday-run-store-import" };

export class StoreImportError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

type Options = {
  target: "local" | "production";
  only: Set<string> | null;
  sources: Source[];
  dryRun: boolean;
  report: string | null;
  atpBase: string | null;
  overtureFile: string | null;
  sourcesFile: string;
};

export function parseArgs(argv: string[]): Options {
  const o: Options = {
    target: "local",
    only: null,
    sources: ["atp", "overture"],
    dryRun: false,
    report: null,
    atpBase: null,
    overtureFile: null,
    sourcesFile: "data/store-sources.csv",
  };
  for (const a of argv) {
    const [flag, value] = a.split(/=(.*)/s) as [string, string | undefined];
    if (flag === "--dry-run" && value === undefined) o.dryRun = true;
    else if (
      flag === "--target" &&
      (value === "local" || value === "production")
    )
      o.target = value;
    else if (flag === "--only" && value) o.only = new Set(value.split(","));
    else if (flag === "--source" && (value === "atp" || value === "overture"))
      o.sources = [value];
    else if (flag === "--source" && value === "all")
      o.sources = ["atp", "overture"];
    else if (flag === "--report" && value) o.report = value;
    else if (flag === "--atp-base" && value) o.atpBase = value;
    else if (flag === "--overture-file" && value) o.overtureFile = value;
    else if (flag === "--file" && value) o.sourcesFile = value;
    else throw new StoreImportError(`unknown or bad flag: ${a}`, 2);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Fetching

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new StoreImportError(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** BUILD F-9 step 3. A spider that 404s, fails or has no US features counts as 0. */
async function fetchAtp(sources: readonly StoreSource[], base: string | null) {
  const rows: StoreRow[] = [];
  const notes: string[] = [];
  const failed = new Set<string>();
  const index = base
    ? JSON.parse(readFileSync(join(base, "latest.json"), "utf8"))
    : await getJson(ATP_INDEX);
  const runId = (index as { run_id?: unknown }).run_id;
  if (typeof runId !== "string" || !/^[\w-]+$/.test(runId))
    throw new StoreImportError("All The Places: no run_id in latest.json");
  for (const s of sources)
    for (const spider of s.atpSpiders) {
      let features: AtpFeature[] = [];
      try {
        const data = base
          ? JSON.parse(
              readFileSync(join(base, "output", `${spider}.geojson`), "utf8"),
            )
          : await getJson(`${ATP_OUTPUT}/${runId}/output/${spider}.geojson`);
        features = (data as { features?: AtpFeature[] }).features ?? [];
      } catch (e) {
        notes.push(
          `atp ${spider}: ${(e as Error).message.slice(0, 80)} (counts as 0)`,
        );
        // FR-43: a failed spider must not shrink a brand that has other spiders.
        failed.add(`${s.retailerId}|atp`);
      }
      for (const f of features) {
        const row = normalizeAtp(f, s.retailerId, s.wikidata);
        if (row) rows.push(row);
      }
    }
  return { rows, notes, failed, release: `ATP run ${runId}` };
}

/** BUILD F-9 step 4: one DuckDB query over Overture's public S3 release (no credentials). */
async function fetchOverture(
  sources: readonly StoreSource[],
  file: string | null,
) {
  const byWikidata = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const s of sources) {
    if (s.wikidata) byWikidata.set(s.wikidata, s.retailerId);
    else if (s.overtureBrandName)
      byName.set(s.overtureBrandName.toLowerCase(), s.retailerId);
  }
  let raw: OvertureRow[];
  let release = "fixture";
  if (file) raw = JSON.parse(readFileSync(file, "utf8")) as OvertureRow[];
  else {
    const catalog = (await getJson(OVERTURE_CATALOG)) as { latest?: unknown };
    if (typeof catalog.latest !== "string" || !/^[\d.-]+$/.test(catalog.latest))
      throw new StoreImportError(
        "Overture: no `latest` release in catalog.json",
      );
    release = catalog.latest;
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    await c.run("INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-west-2';");
    // Literals are checked above or come from the validated CSV (Q-ids, lowercase names).
    const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
    const wd = [...byWikidata.keys()].map(q).join(",") || "NULL";
    const names = [...byName.keys()].map(q).join(",") || "NULL";
    const result = await c.runAndReadAll(`
      SELECT id, names.primary AS name, brand.wikidata AS brand_wikidata,
             brand.names.primary AS brand_name, addresses[1].freeform AS freeform,
             addresses[1].locality AS locality, addresses[1].region AS region,
             addresses[1].postcode AS postcode, addresses[1].country AS country,
             bbox.ymin AS lat, bbox.xmin AS lng, confidence, operating_status
      FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*',
                        hive_partitioning = true)
      WHERE addresses[1].country = 'US'
        AND confidence >= ${OVERTURE_MIN_CONFIDENCE}
        AND coalesce(operating_status, 'open') = 'open'
        AND (brand.wikidata IN (${wd}) OR lower(brand.names.primary) IN (${names}))`);
    raw = result.getRowObjectsJS() as unknown as OvertureRow[];
  }
  const rows = raw
    .map((r) => normalizeOverture(r, byWikidata, byName))
    .filter((r): r is StoreRow => r !== null);
  return {
    rows,
    notes: [] as string[],
    failed: new Set<string>(),
    release: `Overture ${release}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing

async function existingCounts(sql: postgres.Sql) {
  const rows = await sql<{ retailer_id: string; source: Source; n: number }[]>`
    select retailer_id, source, count(*)::int as n from public.retailer_stores
    group by retailer_id, source`;
  return new Map(rows.map((r) => [`${r.retailer_id}|${r.source}`, r.n]));
}

/** FR-43: one transaction per (retailer, source) with new rows; others are left alone. */
async function replace(
  sql: postgres.Sql,
  retailerId: string,
  source: Source,
  rows: StoreRow[],
) {
  // A source can list the same store twice; the unique (source, source_ref) keeps one.
  const unique = [...new Map(rows.map((r) => [r.sourceRef, r])).values()];
  await sql.begin(async (tx) => {
    await tx`delete from public.retailer_stores where retailer_id = ${retailerId} and source = ${source}`;
    for (let i = 0; i < unique.length; i += 1000) {
      const b = unique.slice(i, i + 1000);
      await tx`
        insert into public.retailer_stores
          (retailer_id, source, source_ref, name, address, city, postal_code, state, location)
        select ${retailerId}, ${source}::public.store_source, t.ref, t.name, t.address, t.city,
               t.postal, t.state,
               extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography
        from unnest(${b.map((r) => r.sourceRef)}::text[], ${b.map((r) => r.name)}::text[],
                    ${b.map((r) => r.address)}::text[], ${b.map((r) => r.city)}::text[],
                    ${b.map((r) => r.postalCode)}::text[], ${b.map((r) => r.state)}::text[],
                    ${b.map((r) => r.lat)}::float8[], ${b.map((r) => r.lng)}::float8[])
          as t(ref, name, address, city, postal, state, lat, lng)
        on conflict (source, source_ref) do update set
          retailer_id = excluded.retailer_id, name = excluded.name,
          address = excluded.address, city = excluded.city,
          postal_code = excluded.postal_code, state = excluded.state,
          location = excluded.location, imported_at = now()`;
    }
  });
  return unique.length;
}

// ---------------------------------------------------------------------------------------------

export async function importStores(sql: postgres.Sql, o: Options) {
  const live = await sql<{ id: string }[]>`
    select id from public.retailers where retired_at is null`;
  const parsed = parseStoreSources(
    readFileSync(o.sourcesFile, "utf8"),
    new Set(live.map((r) => r.id)),
  );
  if (!parsed.ok) throw new StoreImportError(parsed.errors.join("\n"));
  const sources = o.only
    ? parsed.rows.filter((s) => o.only!.has(s.retailerId))
    : parsed.rows;

  const fetched: StoreRow[] = [];
  const notes: string[] = [];
  const failed = new Set<string>();
  for (const source of o.sources) {
    const r =
      source === "atp"
        ? await fetchAtp(sources, o.atpBase)
        : await fetchOverture(sources, o.overtureFile);
    fetched.push(...r.rows);
    notes.push(r.release, ...r.notes);
    for (const k of r.failed) failed.add(k);
  }

  const plan = planReplace(
    sources,
    o.sources,
    await existingCounts(sql),
    fetched,
    failed,
  );
  if (!o.dryRun)
    for (const e of plan.filter((p) => p.action === "replace"))
      // The report counts what was written (duplicates collapsed), not what was fetched.
      e.fetched = await replace(
        sql,
        e.retailerId,
        e.source,
        fetched.filter(
          (r) => r.retailerId === e.retailerId && r.source === e.source,
        ),
      );
  const report = coverage(plan);
  return { plan, report, notes };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  // Local never reads SUPABASE_DB_URL, so a shell with the production URL set can't write there.
  const url =
    o.target === "production" ? process.env.SUPABASE_DB_URL : LOCAL_DB_URL;
  if (!url)
    throw new StoreImportError("--target=production needs SUPABASE_DB_URL");
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: o.target === "production" ? "require" : false,
  });
  try {
    const { report, notes, plan } = await importStores(sql, o);
    const text = formatCoverage(report);
    for (const n of notes) console.log(`# ${n}`);
    const kept = plan.filter((p) => p.action === "keep-last-good");
    if (kept.length) {
      const dates = await sql<{ k: string; at: string }[]>`
        select retailer_id || '|' || source as k, max(imported_at)::date::text as at
        from public.retailer_stores group by retailer_id, source`;
      const at = new Map(dates.map((d) => [d.k, d.at]));
      for (const e of kept)
        console.log(
          `# kept last good: ${e.retailerId} ${e.source} (${e.existing} rows from ${at.get(`${e.retailerId}|${e.source}`) ?? "?"})`,
        );
    }
    console.log(text);
    if (o.report) writeFileSync(o.report, `${text}\n`);
    if (o.dryRun) console.log("# dry run: nothing was written");
    if (!o.dryRun) {
      const [{ size }] = await sql<{ size: string }[]>`
        select pg_size_pretty(pg_total_relation_size('public.retailer_stores')) as size`;
      console.log(`# retailer_stores size: ${size} (A-14)`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof StoreImportError) {
      console.error(`import-stores: ${e.message}`);
      process.exit(e.exitCode);
    }
    // Never print connection details: the error code only.
    const code = (e as { code?: unknown })?.code;
    // The code only: a connection error's message can contain the database host.
    console.error(
      `import-stores: failed${typeof code === "string" ? ` (${code})` : ""}`,
    );
    process.exit(1);
  });
}
