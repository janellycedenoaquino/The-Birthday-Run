import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-10 "Tests": the route actions' guards and flow (FR-30–FR-34, metric 2, NFR-7, D10).
// Supabase, the premium guard and the limiter are the faked boundaries; the route library is real.
vi.mock("server-only", () => ({}));
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
const limited = { value: false };
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: vi.fn(async () =>
    limited.value ? { ok: false, error: "M-5" } : { ok: true },
  ),
}));
const reqHeaders = { value: new Headers() };
vi.mock("next/headers", () => ({ headers: async () => reqHeaders.value }));

type Rpc = { data: unknown; error: { message: string; code?: string } | null };
const db = {
  rpc: vi.fn<(fn: string, args: Record<string, unknown>) => Promise<Rpc>>(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  filters: [] as unknown[][],
};
/** A chainable query that resolves to the table's canned answer and records its filters. */
const query = (table: string) => {
  const answer = () =>
    Promise.resolve(db.tables[table] ?? { data: [], error: null });
  const q: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      answer().then(ok, ko),
    maybeSingle: answer,
  };
  for (const m of ["select", "is", "in", "eq", "gte", "order"])
    q[m] = (...args: unknown[]) => {
      db.filters.push([table, m, ...args]);
      return q;
    };
  return q;
};
const supabase = {
  rpc: (...a: Parameters<typeof db.rpc>) => db.rpc(...a),
  from: query,
};

const premium = { value: true };
vi.mock("@/server/auth/app-guards", async () => {
  const { fail } = await import("@/server/auth/guards");
  return {
    requirePremium: vi.fn(async () =>
      premium.value
        ? {
            supabase,
            user: { id: "u1" },
            profile: {
              birthday: { month: 6, day: 15 },
              timeZone: "America/New_York",
            },
          }
        : fail("not_premium"),
    ),
  };
});

const { findStops, getGroupRoute, lookupZip, suggestGroups } =
  await import("@/server/actions/route");

const HOBOKEN = { lat: 40.744, lng: -74.032 };
const retailer = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  timing_type: "from_birthday",
  days_before: null,
  days_after: 7,
  logo_file: null,
  store_finder_url: `https://${id}.example/stores`,
  website_url: `https://${id}.example`,
  ...extra,
});
const storeRow = (
  retailer_id: string,
  store_id: number,
  lat: number,
  lng: number,
) => ({
  retailer_id,
  store_id,
  name: `${retailer_id} store ${store_id}`,
  address: "1 Main St",
  city: "Hoboken",
  state: "NJ",
  postal_code: "07030",
  lat,
  lng,
  distance_m: 0,
});

/** The caller's enrollments (and no pickups), as findStops reads them. */
const enrollIn = (...retailers: ReturnType<typeof retailer>[]) => {
  db.tables.enrollments = {
    data: retailers.map((r) => ({ retailer: r })),
    error: null,
  };
  db.tables.pickups = { data: [], error: null };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T16:00:00Z")); // her birthday in New York
  premium.value = true;
  limited.value = false;
  reqHeaders.value = new Headers({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0)",
  });
  db.tables = {};
  db.filters = [];
  db.rpc.mockReset();
  db.rpc.mockImplementation(async (fn, args) => {
    if (fn === "zip_location" && "p_zip" in args)
      return args.p_zip === "07030"
        ? { data: [{ lat: 40.745, lng: -74.028, state: "NJ" }], error: null }
        : { data: [], error: null };
    if (fn === "zip_location")
      return { data: [{ lat: null, lng: null, state: "NJ" }], error: null };
    return { data: [], error: null };
  });
});
afterEach(() => vi.useRealTimers());

const coords = { kind: "coords" as const, ...HOBOKEN };

describe("metric 2: a free user gets BR-2 from every route action", () => {
  beforeEach(() => {
    premium.value = false;
  });
  it.each([
    ["lookupZip", () => lookupZip({ start: { kind: "zip", zip: "07030" } })],
    ["findStops", () => findStops({ start: coords, retailerIds: ["a"] })],
    [
      "getGroupRoute",
      () =>
        getGroupRoute({
          start: coords,
          groupId: "8f14e45f-ceea-467f-a8e0-9b5c1e1c1d2a",
        }),
    ],
  ])("%s", async (_, call) => {
    expect(await call()).toEqual({ ok: false, error: "BR-2" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("a premium check that fails in the database (premium just ended) is BR-2 too", async () => {
    premium.value = true;
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "not_premium", code: "P0001" },
    });
    expect(await lookupZip({ start: { kind: "zip", zip: "07030" } })).toEqual({
      ok: false,
      error: "BR-2",
    });
  });
});

describe("lookupZip (FR-30, FR-5)", () => {
  it("known ZIP → its state", async () => {
    expect(await lookupZip({ start: { kind: "zip", zip: "07030" } })).toEqual({
      ok: true,
      data: { state: "NJ" },
    });
  });
  it("unknown ZIP → BR-12 on the zip field", async () => {
    const r = await lookupZip({ start: { kind: "zip", zip: "00000" } });
    expect(r).toMatchObject({
      ok: false,
      error: "API-4",
      fieldErrors: { zip: [expect.stringContaining("ZIP")] },
    });
  });
  it("malformed ZIP → BR-12 on the zip field, without a database call", async () => {
    const r = await lookupZip({ start: { kind: "zip", zip: "7030" } });
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { zip: ["We don't recognise that ZIP code."] },
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("coordinates are re-rounded to 3 decimals before the database sees them (A-11)", async () => {
    await lookupZip({
      start: { kind: "coords", lat: 40.74449, lng: -74.03251 },
    });
    expect(db.rpc).toHaveBeenCalledWith("zip_location", {
      p_lat: 40.744,
      p_lng: -74.033,
    });
  });
  it("rate limited → M-5", async () => {
    limited.value = true;
    expect(await lookupZip({ start: { kind: "zip", zip: "07030" } })).toEqual({
      ok: false,
      error: "M-5",
    });
  });
  it("extra keys are refused (strict input)", async () => {
    expect(
      await lookupZip({ start: { kind: "zip", zip: "07030" }, x: 1 }),
    ).toMatchObject({ ok: false, error: "API-4" });
  });
});

describe("findStops (FR-31, FR-32, FR-34)", () => {
  it("drops rewards that aren't available today, orders the stops and builds one desktop link", async () => {
    db.tables.enrollments = {
      data: [
        { retailer: retailer("a", "Alpha") },
        { retailer: retailer("b", "Bravo", { logo_file: "bravo.png" }) },
        // Ended before today: a 3-day reward from Jun 1 is over by Jun 15.
        {
          retailer: retailer("old", "Old", {
            timing_type: "month_start",
            days_after: 3,
          }),
        },
        { retailer: retailer("none", "No Stores") },
      ],
      error: null,
    };
    db.tables.pickups = { data: [], error: null };
    db.rpc.mockImplementation(async (fn) =>
      fn === "nearby_stores"
        ? {
            data: [
              storeRow("a", 1, 40.76, -74.03),
              storeRow("b", 2, 40.75, -74.03),
            ],
            error: null,
          }
        : { data: [], error: null },
    );
    const r = await findStops({
      start: coords,
      retailerIds: ["a", "b", "old", "none"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const route = r.data!;
    // Bravo is nearer the start, so it's stop 1.
    expect(route.stops.map((s) => [s.n, s.retailerName])).toEqual([
      [1, "Bravo"],
      [2, "Alpha"],
    ]);
    // The map pin's logo (decision 0016); a brand without one gets initials.
    expect(route.stops.map((s) => s.logoFile)).toEqual(["bravo.png", null]);
    expect(route.stops[0]!.milesFromPrevious).toBeGreaterThan(0);
    expect(route.noPin).toEqual([
      {
        retailerId: "none",
        retailerName: "No Stores",
        finderUrl: "https://none.example/stores",
      },
    ]);
    expect(route.legs).toHaveLength(1);
    // A browser-location start is never in the link (D10).
    expect(new URL(route.legs[0]!).searchParams.has("origin")).toBe(false);
    const asked = db.rpc.mock.calls.find(([fn]) => fn === "nearby_stores")![1];
    expect(asked.p_retailer_ids).not.toContain("old");
  });

  it("only maps the rewards asked for, even when more are available", async () => {
    db.tables.enrollments = {
      data: [
        { retailer: retailer("a", "Alpha") },
        { retailer: retailer("b", "Bravo") },
      ],
      error: null,
    };
    db.tables.pickups = { data: [], error: null };
    await findStops({ start: coords, retailerIds: ["b"] });
    const asked = db.rpc.mock.calls.find(([fn]) => fn === "nearby_stores")![1];
    expect(asked.p_retailer_ids).toEqual(["b"]);
  });

  it("a bad retailer ID is a field error on retailerIds", async () => {
    expect(
      await findStops({ start: coords, retailerIds: ["Not An ID"] }),
    ).toMatchObject({
      ok: false,
      error: "API-4",
      fieldErrors: { retailerIds: [expect.any(String)] },
    });
  });

  it("store search down → BR-13 message, everything in no-pin, no links (NFR-7)", async () => {
    enrollIn(retailer("a", "Alpha"));
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "timeout", code: "57014" },
    });
    const r = await findStops({ start: coords, retailerIds: ["a"] });
    expect(r).toMatchObject({
      ok: true,
      message: "BR-13",
      data: { stops: [], legs: [] },
    });
    if (r.ok) expect(r.data!.noPin.map((p) => p.retailerId)).toEqual(["a"]);
  });

  it("a ZIP start is resolved to its centroid and goes in the link as origin", async () => {
    enrollIn(retailer("a", "Alpha"));
    db.rpc.mockImplementation(async (fn, args) =>
      fn === "nearby_stores"
        ? { data: [storeRow("a", 1, 40.75, -74.03)], error: null }
        : {
            data:
              args.p_zip === "07030"
                ? [{ lat: 40.745, lng: -74.028, state: "NJ" }]
                : [],
            error: null,
          },
    );
    const r = await findStops({
      start: { kind: "zip", zip: "07030" },
      retailerIds: ["a"],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.data!.start).toEqual({ lat: 40.745, lng: -74.028 });
    expect(new URL(r.data!.legs[0]!).searchParams.get("origin")).toBe("07030");
  });

  it("unknown ZIP → BR-12 before any store search", async () => {
    const r = await findStops({
      start: { kind: "zip", zip: "99999" },
      retailerIds: ["a"],
    });
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { zip: ["We don't recognise that ZIP code."] },
    });
    expect(db.rpc.mock.calls.some(([fn]) => fn === "nearby_stores")).toBe(
      false,
    );
  });

  it("mobile user agent → legs of at most 3 waypoints", async () => {
    reqHeaders.value = new Headers({
      "user-agent": "Mozilla/5.0 (iPhone) Mobile/15E148",
    });
    const ids = ["a", "b", "c", "d", "e"];
    db.tables.enrollments = {
      data: ids.map((id) => ({ retailer: retailer(id, id.toUpperCase()) })),
      error: null,
    };
    db.tables.pickups = { data: [], error: null };
    db.rpc.mockImplementation(async (fn) =>
      fn === "nearby_stores"
        ? {
            data: ids.map((id, i) =>
              storeRow(id, i + 1, 40.75 + i / 100, -74.03),
            ),
            error: null,
          }
        : { data: [], error: null },
    );
    const r = await findStops({ start: coords, retailerIds: ids });
    if (!r.ok) throw new Error(r.error);
    expect(r.data!.legs).toHaveLength(2);
  });
});

describe("getGroupRoute (FR-33)", () => {
  const groupId = "8f14e45f-ceea-467f-a8e0-9b5c1e1c1d2a";
  it("not found (or not theirs, RLS) → BR-11", async () => {
    db.tables.reward_groups = { data: null, error: null };
    expect(await getGroupRoute({ start: coords, groupId })).toEqual({
      ok: false,
      error: "BR-11",
    });
  });

  /** A group of "far" (position 1) then "near", each with one store; the start is near "near". */
  const farThenNear = () => {
    db.tables.reward_groups = {
      data: {
        id: groupId,
        items: [
          { id: "i2", retailer_id: "near", position: 2 },
          { id: "i1", retailer_id: "far", position: 1 },
        ],
      },
      error: null,
    };
    db.tables.retailers = {
      data: [retailer("near", "Near"), retailer("far", "Far")],
      error: null,
    };
    db.rpc.mockImplementation(async (fn) =>
      fn === "nearby_stores"
        ? {
            data: [
              storeRow("near", 1, 40.745, -74.032),
              storeRow("far", 2, 40.8, -74.03),
            ],
            error: null,
          }
        : { data: [], error: null },
    );
  };

  it("keeps the group's order even when another order is shorter", async () => {
    farThenNear();
    const r = await getGroupRoute({ start: coords, groupId });
    if (!r.ok) throw new Error(r.error);
    expect(r.data!.stops.map((s) => s.retailerName)).toEqual(["Far", "Near"]);
  });

  it("leaves out a reward already picked up this cycle (owner, 2026-11-24)", async () => {
    farThenNear();
    enrollIn(retailer("near", "Near"), retailer("far", "Far"));
    db.tables.pickups = {
      data: [{ retailer_id: "far", picked_up_on: "2026-06-15" }],
      error: null,
    };
    const r = await getGroupRoute({ start: coords, groupId });
    if (!r.ok) throw new Error(r.error);
    expect(r.data!.stops.map((s) => s.retailerName)).toEqual(["Near"]);
    const asked = db.rpc.mock.calls.find(([fn]) => fn === "nearby_stores")![1];
    expect(asked.p_retailer_ids).toEqual(["near"]);
  });
});

describe("suggestGroups (FR-29)", () => {
  const ids = ["a", "b", "c", "d", "e"];
  /** Five enrolled, open rewards; stores for the first `withStores`, two tight pairs + one. */
  const five = (withStores: number) => {
    enrollIn(...ids.map((id) => retailer(id, id.toUpperCase())));
    db.tables.reward_group_items = { data: [], error: null };
    const spots: [number, number][] = [
      [40.75, -74.03],
      [40.751, -74.031],
      [40.9, -74.2],
      [40.901, -74.201],
      [40.752, -74.03],
    ];
    db.rpc.mockImplementation(async (fn) =>
      fn === "nearby_stores"
        ? {
            data: ids
              .slice(0, withStores)
              .map((id, i) => storeRow(id, i + 1, ...spots[i]!)),
            error: null,
          }
        : { data: [], error: null },
    );
  };

  it("free user → BR-2", async () => {
    premium.value = false;
    expect(await suggestGroups({ start: coords })).toEqual({
      ok: false,
      error: "BR-2",
    });
  });

  it("fewer than 4 ungrouped rewards → not offered, without a store search", async () => {
    five(5);
    db.tables.reward_group_items = {
      data: [{ retailer_id: "a" }, { retailer_id: "b" }],
      error: null,
    };
    expect(await suggestGroups({ start: coords })).toEqual({
      ok: true,
      data: { offered: false, needed: 4 },
    });
    expect(db.rpc.mock.calls.some(([fn]) => fn === "nearby_stores")).toBe(
      false,
    );
  });

  it("only 3 with a store nearby → not offered (FR-29: 4 with store data)", async () => {
    five(3);
    expect(await suggestGroups({ start: coords })).toEqual({
      ok: true,
      data: { offered: false, needed: 4 },
    });
  });

  it("4 with stores → groups by distance, default pickup, the 5th left out", async () => {
    five(4);
    const r = await suggestGroups({ start: coords });
    if (!r.ok || !r.data?.offered) throw new Error("not offered");
    expect(r.data.groups.map((g) => [...g.retailerIds].sort())).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    // Jun 15 birthday, today Jun 15: tomorrow at 10:00.
    expect(r.data.groups[0]).toMatchObject({
      pickupDate: "2026-06-16",
      pickupTime: "10:00",
    });
    expect(r.data.groups[0]!.stops[0]!.n).toBe(1);
    expect(r.data.leftOut).toEqual([{ retailerId: "e", retailerName: "E" }]);
  });

  it("store search down → BR-13, nothing offered", async () => {
    five(5);
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "timeout", code: "57014" },
    });
    expect(await suggestGroups({ start: coords })).toEqual({
      ok: true,
      message: "BR-13",
      data: { offered: false, needed: 4 },
    });
  });
});
