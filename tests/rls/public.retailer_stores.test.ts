import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importStores, parseArgs } from "../../scripts/import-stores";
import { setPremium } from "../../scripts/grant-premium";
import {
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// BUILD F-9 "Tests": retailer_stores and zip_centroids are unreadable by app roles; nearby_stores
// and zip_location are premium-only and answer within FR-31's limits (D10, D11, DESIGN T-101);
// the store import replaces per source and keeps last good rows (FR-43).
let free: TestUser;
let premium: TestUser;
let db: ReturnType<typeof sql>;
const NYC = { lat: 40.7128, lng: -74.006 };
// Test-only retailers (copies of real rows under new ids), so a real local import is untouched.
const R = "tst-stores-a";
const R2 = "tst-stores-b";
const R3 = "tst-stores-c";

async function store(
  retailer: string,
  source: "atp" | "overture",
  ref: string,
  lat: number,
  lng: number,
) {
  await db`
    insert into public.retailer_stores (retailer_id, source, source_ref, name, location)
    values (${retailer}, ${source}::public.store_source, ${ref}, ${ref},
            extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography)`;
}

beforeAll(async () => {
  db = sql();
  free = await createUser("stores-free");
  premium = await createUser("stores-premium");
  await setPremium(db, premium.email, "grant");
  for (const id of [R, R2, R3])
    await db`
      insert into public.retailers
      select (json_populate_record(null::public.retailers,
              (to_jsonb(r) || jsonb_build_object('id', ${id}::text, 'name', ${id}::text))::json)).*
      from public.retailers r where r.id = 'chipotle'`;
  // Seven Chipotles at growing distances north of the start (~0.011° lat ≈ 1.2 km), one 30 mi away,
  // and an Overture twin 20 m from the nearest ATP store.
  for (let i = 1; i <= 7; i++)
    await store(R, "atp", `t-atp-${i}`, NYC.lat + i * 0.011, NYC.lng);
  await store(R, "atp", "t-far", NYC.lat + 0.45, NYC.lng);
  await store(R, "overture", "t-twin", NYC.lat + 0.011 + 0.00018, NYC.lng);
  await store(R2, "overture", "t-sb", NYC.lat + 0.02, NYC.lng);
  // 1° latitude ≈ 69.05 mi: one store just inside FR-31's 20 miles, one just outside.
  await store(R3, "atp", "t-19mi", NYC.lat + 19 / 69.05, NYC.lng);
  await store(R3, "atp", "t-21mi", NYC.lat + 21 / 69.05, NYC.lng);
});

afterAll(async () => {
  await db`delete from public.retailers where id in (${R}, ${R2}, ${R3})`; // stores cascade
  await db`delete from public.zip_centroids where zip = '00001'`;
  await db.end();
  await deleteUsers(free, premium);
});

describe("tables are closed to app roles (D11)", () => {
  it.each(["retailer_stores", "zip_centroids"] as const)(
    "%s: anon and signed-in users read nothing",
    async (t) => {
      const anon = await publicClient().from(t).select("*").limit(1);
      expect(anon.data ?? []).toEqual([]);
      const user = await premium.client.from(t).select("*").limit(1);
      expect(user.error?.code).toBe("42501");
    },
  );
});

describe("nearby_stores (FR-31, D11)", () => {
  const call = (u: TestUser, ids: string[], perBrand = 5) =>
    u.client.rpc("nearby_stores", {
      p_lat: NYC.lat,
      p_lng: NYC.lng,
      p_retailer_ids: ids,
      p_per_brand: perBrand,
    });

  it("a free user gets not_premium, a signed-out caller can't call it", async () => {
    expect((await call(free, [R])).error?.message).toBe("not_premium");
    const anon = await publicClient().rpc("nearby_stores", {
      p_lat: 1,
      p_lng: 1,
      p_retailer_ids: [R],
    });
    expect(anon.error).not.toBeNull();
  });

  it("premium: at most 5 per brand, within 20 miles, nearest first, Overture twin hidden", async () => {
    const r = await call(premium, [R, R2]);
    expect(r.error).toBeNull();
    const chipotle = r.data!.filter((s) => s.retailer_id === R);
    expect(chipotle.map((s) => s.name)).toEqual([
      "t-atp-1",
      "t-atp-2",
      "t-atp-3",
      "t-atp-4",
      "t-atp-5",
    ]);
    expect(chipotle.every((s) => s.distance_m < 32186.88)).toBe(true);
    expect(r.data!.some((s) => s.name === "t-twin" || s.name === "t-far")).toBe(
      false,
    );
    expect(
      r.data!.filter((s) => s.retailer_id === R2).map((s) => s.name),
    ).toEqual(["t-sb"]);
  });

  it.each([
    ["latitude out of range", { p_lat: 91 }],
    ["no retailers", { p_retailer_ids: [] }],
    ["more than 5 per brand", { p_per_brand: 6 }],
  ])("refuses %s", async (_l, o) => {
    const r = await premium.client.rpc("nearby_stores", {
      p_lat: NYC.lat,
      p_lng: NYC.lng,
      p_retailer_ids: [R],
      p_per_brand: 5,
      ...o,
    });
    expect(r.error?.message).toBe("invalid_input");
  });

  it("the 20-mile edge: a store at 19 miles is in, one at 21 miles is out", async () => {
    const r = await call(premium, [R3]);
    expect(r.data!.map((s) => s.name)).toEqual(["t-19mi"]);
  });

  it("a brand listed twice comes back once", async () => {
    const r = await call(premium, [R2, R2]);
    expect(r.data!.map((s) => s.name)).toEqual(["t-sb"]);
  });

  it("a retired brand's stores are never returned", async () => {
    await db`update public.retailers set retired_at = now() where id = ${R2}`;
    try {
      const r = await call(premium, [R2]);
      expect(r.data).toEqual([]);
    } finally {
      await db`update public.retailers set retired_at = null where id = ${R2}`;
    }
  });
});

describe("zip_location (D10, A-13)", () => {
  beforeAll(async () => {
    await db`
      insert into public.zip_centroids (zip, location, state) values
        ('00001', extensions.st_setsrid(extensions.st_makepoint(-73.04, 40.81), 4326)::extensions.geography, 'NY')
      on conflict (zip) do update set location = excluded.location, state = excluded.state`;
  });

  it("free users get not_premium", async () => {
    expect(
      (await free.client.rpc("zip_location", { p_zip: "00001" })).error
        ?.message,
    ).toBe("not_premium");
  });

  it("premium: a ZIP gives its point and state; coordinates give only the nearest ZIP's state", async () => {
    const byZip = await premium.client.rpc("zip_location", { p_zip: "00001" });
    expect(byZip.data).toEqual([{ lat: 40.81, lng: -73.04, state: "NY" }]);
    const byPoint = await premium.client.rpc("zip_location", {
      p_lat: 40.811,
      p_lng: -73.041,
    });
    expect(byPoint.data?.[0]).toMatchObject({ lat: null, lng: null });
    expect(byPoint.data?.[0]?.state).toMatch(/^[A-Z]{2}$/);
  });

  it("an unknown ZIP returns nothing", async () => {
    expect(
      (await premium.client.rpc("zip_location", { p_zip: "00000" })).data,
    ).toEqual([]);
  });
});

describe("function definitions (Template F-1 rule)", () => {
  it("both functions are definer with an empty search_path and no anon execute", async () => {
    const rows = await db<
      {
        name: string;
        definer: boolean;
        config: string[] | null;
        anon: boolean;
      }[]
    >`
      select p.proname as name, p.prosecdef as definer, p.proconfig as config,
             has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('nearby_stores', 'zip_location')`;
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.definer).toBe(true);
      expect(r.config).toContain('search_path=""');
      expect(r.anon).toBe(false);
    }
  });
});

describe("import:stores on fixtures (FR-43)", () => {
  const dir = mkdtempSync(join(tmpdir(), "stores-fx-"));
  const csv = join(dir, "sources.csv");
  const ovr = join(dir, "overture.json");
  const atp = (features: unknown[]) => {
    mkdirSync(join(dir, "atp", "output"), { recursive: true });
    writeFileSync(
      join(dir, "atp", "latest.json"),
      JSON.stringify({ run_id: "fx-run" }),
    );
    writeFileSync(
      join(dir, "atp", "output", "fx_spider.geojson"),
      JSON.stringify({ features }),
    );
  };
  const feat = (id: string, country = "US") => ({
    id,
    properties: { "addr:country": country, name: id },
    geometry: { type: "Point", coordinates: [-74, 40.7] },
  });
  const run = () =>
    importStores(
      db,
      parseArgs([
        `--file=${csv}`,
        `--atp-base=${join(dir, "atp")}`,
        `--overture-file=${ovr}`,
        `--only=${R2}`,
      ]),
    );
  const count = async (source: string) =>
    (
      await db<{ n: number }[]>`
      select count(*)::int as n from public.retailer_stores where retailer_id = ${R2} and source = ${source}::public.store_source`
    )[0]!.n;

  beforeAll(async () => {
    writeFileSync(
      csv,
      `retailer_id,atp_spiders,wikidata,overture_brand_name\n${R2},fx_spider,,\n`,
    );
    writeFileSync(ovr, "[]");
  });

  it("imports US features only; a re-run gives the same rows, no duplicates", async () => {
    atp([feat("fx-1"), feat("fx-2"), feat("fx-3", "CA")]);
    await run();
    await run();
    expect(await count("atp")).toBe(2);
  });

  it("a source returning 0 keeps the last good rows", async () => {
    atp([]);
    const r = await run();
    expect(r.plan.find((p) => p.source === "atp")?.action).toBe(
      "keep-last-good",
    );
    expect(await count("atp")).toBe(2);
  });

  it("a non-empty fetch replaces the old rows", async () => {
    atp([feat("fx-9")]);
    await run();
    const rows = await db<{ source_ref: string }[]>`
      select source_ref from public.retailer_stores where retailer_id = ${R2} and source = 'atp'`;
    expect(rows.map((r) => r.source_ref)).toEqual(["fx-9"]);
  });
});
