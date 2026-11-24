import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importZips, parseArgs } from "../../scripts/import-zips";
import { sql } from "./helpers";

// BUILD F-9 "Tests": the ZIP import on a 20-row fixture: state by largest land part, and the
// under-90% guard refuses (D10, A-13). The import replaces the whole table, so this runs only on
// a database without real ZIP data (CI, or right after `db reset`); it never wipes a real import.
let db: ReturnType<typeof sql>;
let realData = false;
const dir = mkdtempSync(join(tmpdir(), "zips-fx-"));
const gazHeader =
  "GEOID|GEOIDFQ|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG";
const relHeader = "OID_ZCTA5_20|GEOID_ZCTA5_20|GEOID_COUNTY_20|AREALAND_PART";

function fixture(n: number) {
  const zips = Array.from({ length: n }, (_, i) => String(90000 + i));
  const gaz = join(dir, `gaz-${n}.txt`);
  const rel = join(dir, `rel-${n}.txt`);
  writeFileSync(
    gaz,
    [
      gazHeader,
      ...zips.map((z, i) => `${z}|x|1|1|1|1|${34 + i / 100}|-118`),
    ].join("\n"),
  );
  // Every ZIP straddles a CA county (more land) and an NV county.
  writeFileSync(
    rel,
    [
      relHeader,
      ...zips.flatMap((z) => [`1|${z}|06037|900`, `2|${z}|32003|100`]),
    ].join("\n"),
  );
  return parseArgs([`--gazetteer-file=${gaz}`, `--relationship-file=${rel}`]);
}

beforeAll(async () => {
  db = sql();
  const [{ n }] = await db<
    { n: number }[]
  >`select count(*)::int as n from public.zip_centroids`;
  realData = n > 100;
});
afterAll(async () => {
  if (!realData) await db`truncate public.zip_centroids`;
  await db.end();
});

describe("import:zips on fixtures", () => {
  it("loads 20 ZIPs with the state of their largest county part", async (ctx) => {
    if (realData) ctx.skip();
    const r = await importZips(db, fixture(20));
    expect(r.count).toBe(20);
    const rows = await db<
      { state: string }[]
    >`select distinct state from public.zip_centroids`;
    expect(rows).toEqual([{ state: "CA" }]);
  });

  it("refuses a download under 90% of what's stored and writes nothing", async (ctx) => {
    if (realData) ctx.skip();
    await expect(importZips(db, fixture(10))).rejects.toThrow(/under 90%/);
    const [{ n }] = await db<
      { n: number }[]
    >`select count(*)::int as n from public.zip_centroids`;
    expect(n).toBe(20);
  });
});
