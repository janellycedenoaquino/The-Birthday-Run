import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  coverage,
  normalizeAtp,
  normalizeOverture,
  parseStoreSources,
  planReplace,
  type OvertureRow,
  type StoreRow,
} from "../../scripts/lib/stores";
import {
  joinZips,
  parseGazetteer,
  parseZctaStates,
  zipGuard,
} from "../../scripts/lib/zips";
import { parseRetailerCsv } from "@/lib/retailers/csv-schema";

// BUILD F-9 "Tests": the store and ZIP import rules (FR-43, metric 6, D9, D10, A-13).
const HEADER = "retailer_id,atp_spiders,wikidata,overture_brand_name";
const live = new Set(["chipotle", "target", "cvs"]);

describe("parseStoreSources", () => {
  it("reads spiders, wikidata and the fallback name", () => {
    const r = parseStoreSources(
      `${HEADER}\nchipotle,chipotle;chipotle_ca,Q465751,\ncvs,,,CVS Pharmacy\n`,
      live,
    );
    expect(r).toEqual({
      ok: true,
      rows: [
        {
          retailerId: "chipotle",
          atpSpiders: ["chipotle", "chipotle_ca"],
          wikidata: "Q465751",
          overtureBrandName: null,
        },
        {
          retailerId: "cvs",
          atpSpiders: [],
          wikidata: null,
          overtureBrandName: "CVS Pharmacy",
        },
      ],
    });
  });

  it.each([
    [
      "an unknown or retired retailer",
      "gone,x,,",
      "unknown or retired retailer_id gone",
    ],
    ["a row with no source at all", "target,,,", "needs a spider"],
    ["a bad wikidata id", "target,,P12,", "Q… id"],
    ["a duplicate", "target,x,,\ntarget,y,,", "listed twice"],
    [
      "a spider shared by two rows",
      "target,x,,\ncvs,x,,",
      "spider x is already used by target",
    ],
    [
      "a wikidata id shared by two rows",
      "target,,Q1,\ncvs,,Q1,",
      "wikidata Q1 is already used by target",
    ],
  ])("refuses %s with its row number", (_l, body, msg) => {
    const r = parseStoreSources(`${HEADER}\n${body}\n`, live);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.join(" ")).toMatch(
        new RegExp(`row \\d+: .*${msg.replace(/[.…]/g, ".")}`),
      );
  });

  it("the real data/store-sources.csv covers exactly the live catalogue", () => {
    const catalogue = parseRetailerCsv(
      readFileSync("data/retailers.csv", "utf8"),
    );
    if (!catalogue.ok) throw new Error("retailers.csv must parse");
    const ids = new Set(catalogue.rows.map((r) => r.id));
    const r = parseStoreSources(
      readFileSync("data/store-sources.csv", "utf8"),
      ids,
    );
    expect(r.ok ? [] : r.errors).toEqual([]);
    if (r.ok)
      expect(r.rows.map((x) => x.retailerId).sort()).toEqual([...ids].sort());
  });
});

describe("normalizeAtp (FR-43)", () => {
  const feature = (
    props: Record<string, unknown>,
    coords: unknown = [-73.98, 40.75],
  ) => ({
    id: "abc123",
    properties: {
      "addr:country": "US",
      "brand:wikidata": "Q465751",
      name: "Chipotle",
      ...props,
    },
    geometry: { type: "Point", coordinates: coords },
  });

  it("maps a US feature: id, name, street, city, state, ZIP, [lng, lat]", () => {
    expect(
      normalizeAtp(
        feature({
          "addr:street_address": "1 Main St",
          "addr:city": "New York",
          "addr:state": "ny",
          "addr:postcode": "10001",
        }),
        "chipotle",
        "Q465751",
      ),
    ).toEqual({
      retailerId: "chipotle",
      source: "atp",
      sourceRef: "abc123",
      name: "Chipotle",
      address: "1 Main St",
      city: "New York",
      postalCode: "10001",
      state: "NY",
      lat: 40.75,
      lng: -73.98,
    });
  });

  it("drops non-US features and other brands of a multi-brand spider", () => {
    expect(
      normalizeAtp(feature({ "addr:country": "CA" }), "chipotle", "Q465751"),
    ).toBeNull();
    expect(
      normalizeAtp(
        feature({ "brand:wikidata": "Q25351619" }),
        "chipotle",
        "Q465751",
      ),
    ).toBeNull();
  });

  it("builds the street from number + street; drops a bad state; falls back to brand for the name", () => {
    const r = normalizeAtp(
      feature({
        name: undefined,
        brand: "Chipotle",
        "addr:housenumber": "12",
        "addr:street": "Elm St",
        "addr:state": "Ontario",
      }),
      "chipotle",
      null,
    );
    expect(r).toMatchObject({
      address: "12 Elm St",
      state: null,
      name: "Chipotle",
    });
  });

  it("drops features with no point or out-of-range coordinates", () => {
    expect(normalizeAtp(feature({}, [200, 40]), "chipotle", null)).toBeNull();
    expect(
      normalizeAtp({ ...feature({}), geometry: null }, "chipotle", null),
    ).toBeNull();
  });
});

describe("normalizeOverture (FR-43, D9, DESIGN T-115)", () => {
  const byWd = new Map([["Q2078880", "cvs"]]);
  const byName = new Map([["the body shop", "the-body-shop"]]);
  const row = (o: Partial<OvertureRow> = {}): OvertureRow => ({
    id: "08f2a",
    name: "CVS Pharmacy",
    brand_wikidata: "Q2078880",
    brand_name: "CVS",
    freeform: "5 Oak Ave",
    locality: "Austin",
    region: "US-TX",
    postcode: "73301",
    country: "US",
    lat: 30.27,
    lng: -97.74,
    confidence: 0.9,
    operating_status: null,
    ...o,
  });

  it("maps a confident open US place matched by wikidata (US-TX → TX)", () => {
    expect(normalizeOverture(row(), byWd, byName)).toMatchObject({
      retailerId: "cvs",
      source: "overture",
      sourceRef: "08f2a",
      state: "TX",
      address: "5 Oak Ave",
    });
  });

  it("matches by the fallback brand name when there's no wikidata", () => {
    expect(
      normalizeOverture(
        row({ brand_wikidata: null, brand_name: "The Body Shop" }),
        byWd,
        byName,
      ),
    ).toMatchObject({ retailerId: "the-body-shop" });
  });

  it.each([
    ["low confidence", { confidence: 0.69 }],
    ["closed", { operating_status: "permanently_closed" }],
    ["outside the US", { country: "CA" }],
    ["an unlisted brand", { brand_wikidata: "Q1", brand_name: "Other" }],
  ])("drops %s", (_l, o) => {
    expect(normalizeOverture(row(o), byWd, byName)).toBeNull();
  });
});

describe("planReplace and coverage (FR-43, metric 6)", () => {
  const sources = [
    {
      retailerId: "chipotle",
      atpSpiders: ["chipotle"],
      wikidata: null,
      overtureBrandName: null,
    },
    {
      retailerId: "target",
      atpSpiders: ["target_us"],
      wikidata: null,
      overtureBrandName: null,
    },
    {
      retailerId: "cvs",
      atpSpiders: [],
      wikidata: "Q2078880",
      overtureBrandName: null,
    },
  ];
  const store = (retailerId: string, source: "atp" | "overture"): StoreRow => ({
    retailerId,
    source,
    sourceRef: `${retailerId}-${source}-${Math.random()}`,
    name: retailerId,
    address: null,
    city: null,
    postalCode: null,
    state: null,
    lat: 0,
    lng: 0,
  });

  it("replaces when rows came back, keeps last good on 0, else none", () => {
    const plan = planReplace(
      sources,
      ["atp", "overture"],
      new Map([["target|atp", 40]]),
      [
        store("chipotle", "atp"),
        store("chipotle", "atp"),
        store("cvs", "overture"),
      ],
    );
    const by = (id: string, s: string) =>
      plan.find((p) => p.retailerId === id && p.source === s)?.action;
    expect(by("chipotle", "atp")).toBe("replace");
    expect(by("target", "atp")).toBe("keep-last-good");
    expect(by("cvs", "overture")).toBe("replace");
    expect(by("cvs", "atp")).toBe("none");

    const c = coverage(plan);
    expect(c.lines.find((l) => l.retailerId === "target")).toMatchObject({
      stored: 40,
      status: "kept-last-good",
    });
    expect(c.lines.find((l) => l.retailerId === "chipotle")).toMatchObject({
      atp: 2,
      stored: 2,
      status: "matched",
    });
    expect(c.withStores).toBe(3);
    expect(c.total).toBe(3);
  });

  it("a failed spider keeps the brand's stored rows even when another spider returned some", () => {
    const plan = planReplace(
      sources,
      ["atp"],
      new Map([["chipotle|atp", 900]]),
      [store("chipotle", "atp")],
      new Set(["chipotle|atp"]),
    );
    expect(plan.find((p) => p.retailerId === "chipotle")?.action).toBe(
      "keep-last-good",
    );
  });

  it("a brand nothing found and nothing stored is missing", () => {
    const c = coverage(planReplace(sources, ["atp"], new Map(), []));
    expect(c.lines.every((l) => l.status === "missing")).toBe(true);
    expect(c.withStores).toBe(0);
  });
});

describe("ZIP parsing (D10, A-13)", () => {
  const gaz =
    "GEOID|GEOIDFQ|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG\n10001|x|1|1|1|1|40.75|-73.99\n99999|x|1|1|1|1|bad|1\n";
  const rel =
    "﻿OID_ZCTA5_20|GEOID_ZCTA5_20|GEOID_COUNTY_20|AREALAND_PART\n1|10001|36061|500\n2|10001|34017|900\n3||36061|5\n";

  it("reads internal points and skips bad rows", () => {
    expect(parseGazetteer(gaz)).toEqual([
      { zip: "10001", lat: 40.75, lng: -73.99 },
    ]);
  });

  it("takes the state of the county with the largest land part (BOM tolerated, empty ZCTA skipped)", () => {
    expect(parseZctaStates(rel)).toEqual(new Map([["10001", "NJ"]]));
  });

  it("joins and reports ZIPs without a state", () => {
    const r = joinZips(
      [
        { zip: "10001", lat: 1, lng: 1 },
        { zip: "00000", lat: 1, lng: 1 },
      ],
      new Map([["10001", "NY"]]),
    );
    expect(r.rows).toEqual([{ zip: "10001", lat: 1, lng: 1, state: "NY" }]);
    expect(r.noState).toEqual(["00000"]);
  });

  it("refuses a download under 90% of what's stored, or an empty one", () => {
    expect(zipGuard(33000, 33791)).toBeNull();
    expect(zipGuard(30000, 33791)).toMatch(/under 90%/);
    expect(zipGuard(0, 0)).toMatch(/no ZIP rows/);
    expect(zipGuard(20, 0)).toBeNull();
  });
});
