// Imports data/retailers.csv into public.retailers in one transaction (BUILD F-1 `import:retailers`,
// FR-1, FR-44, D2, A-22). Runs on Node's type stripping, as the database owner:
//   npm run import:retailers                                   # local Supabase
//   npm run import:retailers -- --target=production            # needs SUPABASE_DB_URL
// Test and owner flags: --file=<csv> (default data/retailers.csv), --logos=<dir> (default
// public/retailers), --allow-retire=<n> (A-22: more than 5 retirements needs this, manual runs only).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import {
  CSV_COLUMNS,
  parseRetailerCsv,
  type RetailerRow,
} from "../src/lib/retailers/csv-schema.ts";

export const LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
/** A-22: an automatic run may retire at most this many retailers. */
export const DEFAULT_RETIRE_LIMIT = 5;

/** DESIGN §3 columns the CSV owns (`states` becomes these two). */
const COLUMNS = [
  ...CSV_COLUMNS.filter((c) => c !== "states"),
  "states_scope",
  "state_codes",
] as const;

export type ImportCounts = {
  inserted: number;
  updated: number;
  unchanged: number;
  retired: number;
  restored: number;
};

export class ImportError extends Error {
  readonly lines: string[];
  constructor(lines: string[]) {
    super(lines.join("\n"));
    this.lines = lines;
  }
}

/** Checks the CSV and logos, then writes everything or nothing. */
export async function importRetailers(
  sql: postgres.Sql,
  csvText: string,
  options: { logoDir: string; retireLimit?: number; today?: string },
): Promise<ImportCounts> {
  const parsed = parseRetailerCsv(csvText, { today: options.today });
  if (!parsed.ok)
    throw new ImportError(
      parsed.errors.map(
        (e) => `row ${e.row}${e.column ? ` ${e.column}` : ""}: ${e.code}`,
      ),
    );
  const rows = parsed.rows;
  const missingLogos = rows.flatMap((r, i) =>
    r.logo_file && !existsSync(join(options.logoDir, r.logo_file))
      ? [`row ${i + 2} logo_file: missing_file`]
      : [],
  );
  if (missingLogos.length) throw new ImportError(missingLogos);

  const ids = rows.map((r) => r.id);
  const retireLimit = options.retireLimit ?? DEFAULT_RETIRE_LIMIT;

  return sql.begin(async (tx) => {
    // Serialise concurrent runs (the Action's concurrency group is the first guard).
    await tx`lock table public.retailers in share row exclusive mode`;
    const retiredBefore = new Set(
      (
        await tx<
          { id: string }[]
        >`select id from public.retailers where retired_at is not null`
      ).map((r) => r.id),
    );

    const set = COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ");
    const mine = COLUMNS.map((c) => `retailers.${c}`).join(", ");
    const theirs = COLUMNS.map((c) => `excluded.${c}`).join(", ");
    const values = rows.map((r) => pick(r));
    const written = values.length
      ? await tx<{ id: string; inserted: boolean }[]>`
          insert into public.retailers ${tx(values, ...COLUMNS)}
          on conflict (id) do update set ${tx.unsafe(set)}, retired_at = null
          where (${tx.unsafe(mine)}, retailers.retired_at)
                is distinct from (${tx.unsafe(theirs)}, null)
          returning id, (xmax = 0) as inserted`
      : [];

    const retired = await tx<{ id: string }[]>`
      update public.retailers set retired_at = now()
      where retired_at is null and id <> all(${ids}::text[])
      returning id`;
    if (retired.length > retireLimit)
      throw new ImportError([
        `would retire ${retired.length} retailers (limit ${retireLimit}, A-22): ${retired
          .map((r) => r.id)
          .join(", ")}`,
        "nothing was written; re-run by manual dispatch with --allow-retire=<n> if this is intended",
      ]);
    // FR-44: F-6's PR adds `delete from public.reward_group_items where retailer_id = any(…)` here.

    const inserted = written.filter((w) => w.inserted).length;
    const restored = written.filter(
      (w) => !w.inserted && retiredBefore.has(w.id),
    ).length;
    const updated = written.length - inserted - restored;
    return {
      inserted,
      updated,
      unchanged: rows.length - written.length,
      retired: retired.length,
      restored,
    };
  });
}

function pick(r: RetailerRow) {
  return Object.fromEntries(COLUMNS.map((c) => [c, r[c]])) as Record<
    (typeof COLUMNS)[number],
    string | number | boolean | string[] | null
  >;
}

function parseArgs(argv: string[]) {
  const opts: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new ImportError([`unknown argument: ${arg}`]);
    opts[m[1]!] = m[2]!;
  }
  const known = new Set(["target", "file", "logos", "allow-retire"]);
  for (const k of Object.keys(opts))
    if (!known.has(k)) throw new ImportError([`unknown flag: --${k}`]);
  const target = opts.target ?? "local";
  if (target !== "local" && target !== "production")
    throw new ImportError(["--target must be local or production"]);
  const allow = opts["allow-retire"];
  if (allow !== undefined && !/^\d{1,4}$/.test(allow))
    throw new ImportError(["--allow-retire must be a whole number"]);
  return {
    target,
    file: opts.file ?? "data/retailers.csv",
    logos: opts.logos ?? "public/retailers",
    retireLimit: allow === undefined ? undefined : Number(allow),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Local never reads SUPABASE_DB_URL, so a shell with the production URL set can't write there by accident.
  const url =
    args.target === "production" ? process.env.SUPABASE_DB_URL : LOCAL_DB_URL;
  if (!url)
    throw new ImportError(["--target=production needs SUPABASE_DB_URL"]);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const counts = await importRetailers(sql, readFileSync(args.file, "utf8"), {
      logoDir: args.logos,
      retireLimit: args.retireLimit,
    });
    console.log(
      `import-retailers (${args.target}): ${Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(" / ")}`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof ImportError) for (const l of e.lines) console.error(l);
    // A SQL error: print its code and message only, never the connection URL.
    else if (e instanceof postgres.PostgresError)
      console.error(`database error ${e.code}: ${e.message}`);
    else console.error(e instanceof Error ? e.message : String(e));
    console.error("import-retailers: nothing was written");
    process.exit(1);
  });
}
