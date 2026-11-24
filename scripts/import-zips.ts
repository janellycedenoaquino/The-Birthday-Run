// Imports US ZIP centroids and their states into public.zip_centroids (BUILD F-9 `import:zips`,
// D10, A-13). Runs on Node's type stripping, as the database owner:
//   npm run import:zips                                    # local Supabase
//   npm run import:zips -- --target=production             # needs SUPABASE_DB_URL
// Flags: --year=<yyyy> (Gazetteer year; default the newest that answers 200).
// Test flags: --gazetteer-file=<txt>, --relationship-file=<txt> (skip the downloads).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import {
  joinZips,
  parseGazetteer,
  parseZctaStates,
  zipGuard,
} from "./lib/zips.ts";

export const LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const GAZ = (y: number) =>
  `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${y}_Gazetteer/${y}_Gaz_zcta_national.zip`;
const REL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
const UA = { "user-agent": "the-birthday-run-zip-import" };

export class ZipImportError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

type Options = {
  target: "local" | "production";
  year: number | null;
  gazetteerFile: string | null;
  relationshipFile: string | null;
};

export function parseArgs(argv: string[]): Options {
  const o: Options = {
    target: "local",
    year: null,
    gazetteerFile: null,
    relationshipFile: null,
  };
  for (const a of argv) {
    const [flag, value] = a.split(/=(.*)/s) as [string, string | undefined];
    if (flag === "--target" && (value === "local" || value === "production"))
      o.target = value;
    else if (flag === "--year" && value && /^20\d\d$/.test(value))
      o.year = Number(value);
    else if (flag === "--gazetteer-file" && value) o.gazetteerFile = value;
    else if (flag === "--relationship-file" && value)
      o.relationshipFile = value;
    else throw new ZipImportError(`unknown or bad flag: ${a}`, 2);
  }
  return o;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new ZipImportError(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The newest Gazetteer year that answers 200 (this year back to 2020), unzipped to text. */
async function gazetteerText(
  year: number | null,
): Promise<{ text: string; year: number }> {
  const years = year
    ? [year]
    : Array.from({ length: 7 }, (_, i) => new Date().getUTCFullYear() - i);
  for (const y of years) {
    const res = await fetch(GAZ(y), { method: "HEAD", headers: UA });
    if (!res.ok) continue;
    const dir = mkdtempSync(join(tmpdir(), "zips-"));
    try {
      const zipPath = join(dir, "gaz.zip");
      writeFileSync(zipPath, await download(GAZ(y)));
      // `unzip -p` prints the single .txt inside; the archive is a public Census file.
      return {
        text: execFileSync("unzip", ["-p", zipPath], {
          maxBuffer: 64 * 1024 * 1024,
        }).toString("utf8"),
        year: y,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  throw new ZipImportError("no Gazetteer year answered 200");
}

export async function importZips(sql: postgres.Sql, o: Options) {
  const gaz = o.gazetteerFile
    ? { text: readFileSync(o.gazetteerFile, "utf8"), year: 0 }
    : await gazetteerText(o.year);
  const rel = o.relationshipFile
    ? readFileSync(o.relationshipFile, "utf8")
    : (await download(REL)).toString("utf8");
  const { rows, noState } = joinZips(
    parseGazetteer(gaz.text),
    parseZctaStates(rel),
  );
  const [{ n }] = await sql<
    { n: number }[]
  >`select count(*)::int as n from public.zip_centroids`;
  const refused = zipGuard(rows.length, n);
  if (refused) throw new ZipImportError(refused);
  await sql.begin(async (tx) => {
    await tx`truncate public.zip_centroids`;
    for (let i = 0; i < rows.length; i += 5000) {
      const b = rows.slice(i, i + 5000);
      await tx`
        insert into public.zip_centroids (zip, location, state)
        select t.zip, extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography, t.state
        from unnest(${b.map((r) => r.zip)}::text[], ${b.map((r) => r.lat)}::float8[],
                    ${b.map((r) => r.lng)}::float8[], ${b.map((r) => r.state)}::text[])
          as t(zip, lat, lng, state)`;
    }
  });
  return { count: rows.length, noState, year: gaz.year };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  // Local never reads SUPABASE_DB_URL, so a shell with the production URL set can't write there.
  const url =
    o.target === "production" ? process.env.SUPABASE_DB_URL : LOCAL_DB_URL;
  if (!url)
    throw new ZipImportError("--target=production needs SUPABASE_DB_URL");
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: o.target === "production" ? "require" : false,
  });
  try {
    const r = await importZips(sql, o);
    console.log(
      `import-zips (${o.target}): ${r.count} ZIPs${r.year ? ` from the ${r.year} Gazetteer` : ""}; ${r.noState.length} without a state (not stored)`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof ZipImportError) {
      console.error(`import-zips: ${e.message}`);
      process.exit(e.exitCode);
    }
    const code = (e as { code?: unknown })?.code;
    console.error(
      `import-zips: failed${typeof code === "string" ? ` (${code})` : ""}`,
    );
    process.exit(1);
  });
}
