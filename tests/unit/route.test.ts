import { describe, expect, it } from "vitest";
import { haversineMeters, toMiles, type LatLng } from "@/lib/route/distance";
import { deviceFromHeaders, googleLegs } from "@/lib/route/google-links";
import { nearestNeighbour, orderStops, pathLength } from "@/lib/route/order";
import { chooseStops, type StoreCandidate } from "@/lib/route/stops";

// BUILD F-10 "Tests" (FR-31, FR-32, FR-34, D10).

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

describe("haversineMeters", () => {
  it.each([
    [NYC, LA, 3_935_746],
    [LONDON, PARIS, 343_556],
  ])("matches known city pairs within 0.5%%", (a, b, expected) => {
    expect(Math.abs(haversineMeters(a, b) - expected) / expected).toBeLessThan(0.005);
  });
  it("is 0 for the same point and symmetric", () => {
    expect(haversineMeters(NYC, NYC)).toBe(0);
    expect(haversineMeters(NYC, LA)).toBe(haversineMeters(LA, NYC));
  });
  it("toMiles rounds to one decimal", () => {
    expect(toMiles(1609.344)).toBe(1);
    expect(toMiles(2500)).toBe(1.6);
  });
});

// A small grid near the origin: 0.01° of latitude ≈ 1.1 km.
const at = (lat: number, lng: number): LatLng => ({ lat: 40 + lat / 100, lng: -74 + lng / 100 });
const START = at(0, 0);

describe("orderStops", () => {
  it("finds the optimal order for a known 6-stop case where nearest-neighbour doesn't", () => {
    // Nearest-neighbour goes right to x=1, left to -1.5, -3, -4, then back right (length 15).
    const stops = [at(0, 1), at(0, -1.5), at(0, 4), at(0, 5), at(0, -3), at(0, -4)];
    const nn = nearestNeighbour(stops, START);
    const best = orderStops(stops, START);
    // Optimal open path: cover the near (left) side, then the right: 4 + 9 = 13 units; right
    // first is 14. 2-opt must reach that length (several orders share it).
    const optimal = [at(0, -1.5), at(0, -3), at(0, -4), at(0, 1), at(0, 4), at(0, 5)];
    expect(pathLength(START, best)).toBeCloseTo(pathLength(START, optimal), 0);
    expect(best.slice(3).map((p) => p.lng)).toEqual(optimal.slice(3).map((p) => p.lng));
    expect(pathLength(START, best)).toBeLessThan(pathLength(START, nn));
  });

  it("is never longer than nearest-neighbour (random fixed points)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 20 - 10;
    for (let t = 0; t < 30; t++) {
      const stops = Array.from({ length: 2 + (t % 9) }, () => at(rand(), rand()));
      const nn = pathLength(START, nearestNeighbour(stops, START));
      expect(pathLength(START, orderStops(stops, START))).toBeLessThanOrEqual(nn + 1e-6);
    }
  });

  it("keeps every stop exactly once", () => {
    const stops = [at(1, 1), at(2, 5), at(-3, 2), at(4, -4)];
    expect(new Set(orderStops(stops, START))).toEqual(new Set(stops));
  });
});

const store = (retailerId: string, storeId: number, p: LatLng): StoreCandidate => ({
  ...p,
  retailerId,
  storeId,
  storeName: `${retailerId} #${storeId}`,
  address: null,
});

describe("chooseStops", () => {
  it("swaps to the store clustered with the others over a nearer outlier", () => {
    const candidates = new Map([
      ["a", [store("a", 1, at(5, 5))]],
      ["b", [store("b", 2, at(5.2, 5))]],
      // c's nearest store is west of the start; its other store sits next to a and b.
      ["c", [store("c", 3, at(0, -2)), store("c", 4, at(5, 5.3))]],
    ]);
    const { chosen } = chooseStops(["a", "b", "c"], candidates, START);
    expect(chosen.find((s) => s.retailerId === "c")?.storeId).toBe(4);
  });

  it("lists brands without candidates as no-pin, in input order", () => {
    const candidates = new Map([["a", [store("a", 1, at(1, 1))]], ["b", []]]);
    const { chosen, noPin } = chooseStops(["z", "a", "b"], candidates, START);
    expect(chosen.map((s) => s.retailerId)).toEqual(["a"]);
    expect(noPin).toEqual(["z", "b"]);
  });

  it("breaks ties by the lower store ID, whatever the input order", () => {
    const p = at(1, 1);
    const one = chooseStops(["a"], new Map([["a", [store("a", 9, p), store("a", 2, p)]]]), START);
    const two = chooseStops(["a"], new Map([["a", [store("a", 2, p), store("a", 9, p)]]]), START);
    expect(one.chosen[0]?.storeId).toBe(2);
    expect(two.chosen[0]?.storeId).toBe(2);
  });

  it("keeps the brands' order for groups and scores the path in that order", () => {
    const candidates = new Map([
      ["a", [store("a", 1, at(0, 2))]],
      ["b", [store("b", 2, at(0, 4)), store("b", 3, at(0, -1))]],
    ]);
    const { chosen } = chooseStops(["a", "b"], candidates, START, { ordered: true });
    expect(chosen.map((s) => s.storeId)).toEqual([1, 2]); // start → a → b: b's east store is on the way
  });
});

describe("googleLegs", () => {
  const stops = (n: number) => Array.from({ length: n }, (_, i) => at(i, i));
  const params = (url: string) => new URL(url).searchParams;
  const waypointCount = (url: string) => params(url).get("waypoints")?.split("|").length ?? 0;

  it("mobile: 4 stops fit one link (3 waypoints); 5 make 2 legs, leg 2 starting at stop 4", () => {
    expect(googleLegs(stops(4), { kind: "coords" }, "mobile")).toHaveLength(1);
    expect(waypointCount(googleLegs(stops(4), { kind: "coords" }, "mobile")[0]!)).toBe(3);
    const legs = googleLegs(stops(5), { kind: "coords" }, "mobile");
    expect(legs).toHaveLength(2);
    const s4 = stops(5)[3]!;
    expect(params(legs[1]!).get("origin")).toBe(`${s4.lat.toFixed(5)},${s4.lng.toFixed(5)}`);
    expect(params(legs[1]!).get("waypoints")).toBeNull();
  });

  it("desktop: 10 stops fit one link; 11 make 2 legs", () => {
    expect(googleLegs(stops(10), { kind: "coords" }, "desktop")).toHaveLength(1);
    expect(googleLegs(stops(11), { kind: "coords" }, "desktop")).toHaveLength(2);
  });

  it("never puts a browser-location start in a URL; a ZIP start is leg 1's origin", () => {
    const coords = googleLegs(stops(3), { kind: "coords" }, "desktop");
    expect(params(coords[0]!).has("origin")).toBe(false);
    const zip = googleLegs(stops(5), { kind: "zip", zip: "07030" }, "mobile");
    expect(params(zip[0]!).get("origin")).toBe("07030");
    expect(params(zip[1]!).get("origin")).not.toBe("07030");
  });

  it("one stop: one leg with a destination only", () => {
    const [url] = googleLegs(stops(1), { kind: "coords" }, "mobile");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&travelmode=driving&/);
    expect(params(url!).get("destination")).toBeTruthy();
    expect(params(url!).has("waypoints")).toBe(false);
  });

  it("encodes separators and stays under 2,048 characters at 40 stops", () => {
    for (const device of ["mobile", "desktop"] as const) {
      for (const url of googleLegs(stops(40), { kind: "zip", zip: "10001" }, device)) {
        expect(url.length).toBeLessThanOrEqual(2048);
        if (url.includes("waypoints")) expect(url).toContain("%7C");
        expect(url).toContain("%2C");
        expect(url).not.toMatch(/[|,]/);
      }
    }
  });

  it("no stops → no links", () => {
    expect(googleLegs([], { kind: "coords" }, "desktop")).toEqual([]);
  });
});

describe("deviceFromHeaders", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it.each([
    [{ "sec-ch-ua-mobile": "?1" }, "mobile"],
    [{ "sec-ch-ua-mobile": "?0", "user-agent": "Mozilla/5.0 (Windows NT 10.0)" }, "desktop"],
    [{ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148" }, "mobile"],
    [{ "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9)" }, "mobile"],
    [{ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }, "desktop"],
    [{}, "desktop"],
  ])("%o → %s", (headers, device) => {
    expect(deviceFromHeaders(h(headers))).toBe(device);
  });
});
