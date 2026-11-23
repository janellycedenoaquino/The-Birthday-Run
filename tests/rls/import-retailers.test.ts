import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "@/lib/retailers/csv-schema";
import {
  ImportError,
  importRetailers,
} from "../../scripts/import-retailers.ts";
import { sql } from "./helpers";

// `import:retailers` on the local DB (BUILD F-1 "Tests": FR-1, FR-44, A-22). The test owns the
// table while it runs: it empties it first and re-imports the real CSV at the end.
// Enrollments point at retailers with an FK `restrict`, so they go first (test users' only; F-5's
// pickups will need the same). This file runs alone in the rls project (no file parallelism).
const db = sql();
const LOGOS = mkdtempSync(join(tmpdir(), "retailer-logos-"));
writeFileSync(join(LOGOS, "fixture-a.png"), "");
const TODAY = "2026-11-23";

type Cells = Partial<Record<(typeof CSV_COLUMNS)[number], string>>;
const row = (id: string, cells: Cells = {}) => {
  const base: Record<(typeof CSV_COLUMNS)[number], string> = {
    id,
    name: `Fixture ${id}`,
    category: "food_drink",
    description: "Fixture retailer",
    reward_description: "Free fixture",
    timing_type: "birth_month",
    days_before: "",
    days_after: "",
    reward_type: "free_item",
    requires_purchase: "no",
    purchase_requirement: "",
    membership_requirement: "",
    other_requirement: "",
    signup_lead_days: "",
    logo_file: "",
    website_url: "https://example.com",
    store_finder_url: "",
    states: "all",
    is_popular: "no",
    last_checked_on: "2026-11-01",
    source_url: "https://example.com/rewards",
  };
  return CSV_COLUMNS.map((c) => cells[c] ?? base[c]).join(",");
};
const csv = (...rows: string[]) =>
  [CSV_COLUMNS.join(","), ...rows].join("\n") + "\n";
const run = (text: string, retireLimit?: number) =>
  importRetailers(db, text, { logoDir: LOGOS, retireLimit, today: TODAY });
const snapshot = () =>
  db`select * from public.retailers order by id`.then((r) => [...r]);
const ids3 = ["fixture-a", "fixture-b", "fixture-c"];
const three = (cells: Record<string, Cells> = {}) =>
  csv(...ids3.map((id) => row(id, cells[id])));

beforeAll(async () => {
  await db`delete from public.enrollments`;
  await db`delete from public.retailers`;
});
beforeEach(async () => {
  await db`delete from public.enrollments`;
  await db`delete from public.retailers`;
});
afterAll(async () => {
  await db`delete from public.enrollments`;
  await db`delete from public.retailers`;
  await importRetailers(db, readFileSync("data/retailers.csv", "utf8"), {
    logoDir: "public/retailers",
  });
  await db.end();
});

describe("import:retailers (FR-1)", () => {
  it("empty DB → all rows; re-run → nothing changes, updated_at kept", async () => {
    expect(await run(three())).toEqual({
      inserted: 3,
      updated: 0,
      unchanged: 0,
      retired: 0,
      restored: 0,
    });
    const before = await snapshot();
    expect(await run(three())).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 3,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("an edited row updates only that retailer; a rename keeps its id", async () => {
    await run(three());
    const counts = await run(
      three({ "fixture-b": { name: "Renamed B", reward_description: "New" } }),
    );
    expect(counts).toMatchObject({ updated: 1, unchanged: 2 });
    const [b] =
      await db`select name, reward_description from public.retailers where id = 'fixture-b'`;
    expect(b).toEqual({ name: "Renamed B", reward_description: "New" });
  });

  it("a bad row → numbered error and the table is unchanged", async () => {
    await run(three());
    const before = await snapshot();
    await expect(
      run(
        csv(
          row("fixture-a"),
          row("fixture-b", { category: "shoes" }),
          row("fixture-d"),
        ),
      ),
    ).rejects.toMatchObject({ lines: ["row 3 category: invalid_enum"] });
    expect(await snapshot()).toEqual(before);
  });

  it("a missing logo file → error, nothing written", async () => {
    await expect(
      run(csv(row("fixture-a", { logo_file: "nope.png" }))),
    ).rejects.toMatchObject({ lines: ["row 2 logo_file: missing_file"] });
    expect(await snapshot()).toEqual([]);
    // A logo that exists is fine.
    await expect(
      run(csv(row("fixture-a", { logo_file: "fixture-a.png" }))),
    ).resolves.toMatchObject({ inserted: 1 });
  });
});

describe("import:retailers edge cases (FR-1)", () => {
  it("a missing logo's row number counts blank lines and multi-line fields", async () => {
    const text =
      csv(row("fixture-a", { description: '"Line one\nline two"' })).replace(
        /\n$/,
        "\n\n",
      ) +
      row("fixture-b", { logo_file: "nope.png" }) +
      "\n";
    // header = 1, fixture-a = lines 2-3, blank = 4, fixture-b = 5
    await expect(run(text)).rejects.toMatchObject({
      lines: ["row 5 logo_file: missing_file"],
    });
  });

  it("two names swapped in one edit → a clear error, nothing written", async () => {
    await run(three());
    const before = await snapshot();
    await expect(
      run(
        three({
          "fixture-a": { name: "Fixture fixture-b" },
          "fixture-b": { name: "Fixture fixture-a" },
        }),
      ),
    ).rejects.toMatchObject({
      lines: [
        expect.stringMatching(/^name already used by another retailer/),
        expect.any(String),
      ],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("a new id reusing a retired retailer's name → the same clear error", async () => {
    await run(three());
    await run(csv(row("fixture-a"), row("fixture-b")));
    await expect(
      run(
        csv(
          row("fixture-a"),
          row("fixture-b"),
          row("fixture-new", { name: "Fixture fixture-c" }),
        ),
      ),
    ).rejects.toBeInstanceOf(ImportError);
  });
});

describe("retire and restore (FR-44)", () => {
  it("a removed row is retired, not deleted; adding it back restores it", async () => {
    await run(three());
    expect(await run(csv(row("fixture-a"), row("fixture-c")))).toMatchObject({
      retired: 1,
      unchanged: 2,
    });
    const [b] =
      await db`select retired_at from public.retailers where id = 'fixture-b'`;
    expect(b?.retired_at).not.toBeNull();

    expect(await run(three())).toMatchObject({
      restored: 1,
      updated: 0,
      unchanged: 2,
    });
    const [again] =
      await db`select retired_at from public.retailers where id = 'fixture-b'`;
    expect(again?.retired_at).toBeNull();
  });

  it("more than 5 retirements stops the run (A-22) unless allowed", async () => {
    const seven = csv(
      ...Array.from({ length: 7 }, (_, i) => row(`fixture-${i}`)),
    );
    await run(seven);
    const before = await snapshot();
    const err = await run(csv(row("fixture-0")), undefined).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).lines[0]).toMatch(
      /^would retire 6 retailers \(limit 5, A-22\)/,
    );
    expect(await snapshot()).toEqual(before);
    await expect(run(csv(row("fixture-0")), 6)).resolves.toMatchObject({
      retired: 6,
    });
  });

  it("exactly 5 retirements is allowed; a header-only CSV is stopped", async () => {
    const seven = csv(
      ...Array.from({ length: 7 }, (_, i) => row(`fixture-${i}`)),
    );
    await run(seven);
    await expect(
      run(csv(row("fixture-0"), row("fixture-1"))),
    ).resolves.toMatchObject({ retired: 5 });
    await run(seven);
    await expect(run(csv())).rejects.toBeInstanceOf(ImportError);
    expect(
      (await snapshot()).filter((r) => r.retired_at === null),
    ).toHaveLength(7);
  });
});

describe("the CLI", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/import-retailers.ts", ...args], {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_DB_URL: undefined },
    });

  it("prints numbered errors and exits 1 on a bad CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "retailer-csv-"));
    const file = join(dir, "bad.csv");
    writeFileSync(file, csv(row("fixture-a", { states: "XX" })));
    const r = cli(`--file=${file}`, `--logos=${LOGOS}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("row 2 states: state_code");
    expect(r.stderr).toContain("nothing was written");
  });

  it("--target=local never uses SUPABASE_DB_URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "retailer-csv-"));
    const file = join(dir, "ok.csv");
    writeFileSync(file, csv(row("fixture-a")));
    const r = spawnSync(
      process.execPath,
      ["scripts/import-retailers.ts", `--file=${file}`, `--logos=${LOGOS}`],
      {
        encoding: "utf8",
        // A documentation-range address: any attempt to use it would fail.
        env: {
          ...process.env,
          SUPABASE_DB_URL: "postgresql://nobody:x@192.0.2.1:5432/postgres",
        },
      },
    );
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("import-retailers (local): inserted 1");
  });

  it("--allow-retire takes digits only", () => {
    expect(cli("--allow-retire=5;rm").stderr).toContain(
      "--allow-retire must be a whole number",
    );
  });

  it("refuses production without SUPABASE_DB_URL and unknown flags", () => {
    const prod = cli("--target=production");
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain("needs SUPABASE_DB_URL");
    expect(cli("--target=staging").stderr).toContain(
      "--target must be local or production",
    );
    expect(cli("--force").stderr).toContain("unknown argument");
  });
});
