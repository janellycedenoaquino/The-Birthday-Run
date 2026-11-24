import { describe, expect, it } from "vitest";
import { haversineMeters } from "@/lib/route/distance";
import { suggestGroups } from "@/lib/route/smart-grouping";

// BUILD F-11 "Tests" (FR-29, FR-25, D12): fixed coordinates; 0.01° of latitude ≈ 1.1 km.
const LIMITS = {
  minOffered: 4,
  minGroupSize: 2,
  maxGroups: 4,
  maxGroupSize: 10,
};
const stop = (retailerId: string, lat: number, lng: number) => ({
  retailerId,
  lat: 40 + lat / 100,
  lng: -74 + lng / 100,
});
const ids = (groups: { retailerId: string }[][]) =>
  groups.map((g) => g.map((s) => s.retailerId));

describe("suggestGroups (FR-29)", () => {
  it("three tight clusters + one outlier → 3 groups; the outlier joins the nearest with room", () => {
    const stops = [
      stop("a1", 0, 0),
      stop("a2", 0.2, 0),
      stop("a3", 0, 0.2),
      stop("b1", 20, 0),
      stop("b2", 20.2, 0),
      stop("b3", 20, 0.2),
      stop("c1", 0, 20),
      stop("c2", 0.2, 20),
      stop("c3", 0, 20.2),
      stop("z", 3, 3), // nearest to the a-cluster
    ];
    const { groups, leftOut } = suggestGroups(stops, LIMITS);
    expect(ids(groups)).toEqual([
      ["a1", "a2", "a3", "z"],
      ["b1", "b2", "b3"],
      ["c1", "c2", "c3"],
    ]);
    expect(leftOut).toEqual([]);
  });

  it("exactly 4 stops still make groups (2 + 2, nearest pairs)", () => {
    const { groups } = suggestGroups(
      [stop("a", 0, 0), stop("b", 0, 1), stop("c", 30, 0), stop("d", 30, 1)],
      LIMITS,
    );
    expect(ids(groups)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("45 stops: never over FR-25's 10, never more than 4 groups, no group of 1", () => {
    const stops = Array.from({ length: 45 }, (_, i) =>
      stop(
        `r${String(i).padStart(2, "0")}`,
        (i % 9) * 3,
        Math.floor(i / 9) * 3,
      ),
    );
    const { groups, leftOut } = suggestGroups(stops, LIMITS);
    expect(groups.length).toBeLessThanOrEqual(4);
    for (const g of groups) {
      expect(g.length).toBeGreaterThanOrEqual(2);
      expect(g.length).toBeLessThanOrEqual(10);
    }
    // Everything is either grouped or listed as left out, once.
    const all = [...groups.flat(), ...leftOut].map((s) => s.retailerId).sort();
    expect(all).toEqual(stops.map((s) => s.retailerId).sort());
    expect(groups.flat().length).toBeGreaterThan(0);
  });

  it("complete, not single, linkage: an evenly spaced chain isn't one long group", () => {
    const chain = Array.from({ length: 8 }, (_, i) => stop(`s${i}`, 0, i * 2));
    const { groups } = suggestGroups(chain, LIMITS);
    expect(groups).toHaveLength(4);
    // Each group spans neighbours only: no group wider than two steps.
    for (const g of groups)
      for (const x of g)
        for (const y of g) expect(haversineMeters(x, y)).toBeLessThan(4_000);
  });

  it("is deterministic whatever the input order", () => {
    const stops = [
      stop("d", 0, 1),
      stop("a", 0, 0),
      stop("c", 9, 1),
      stop("b", 9, 0),
    ];
    const one = suggestGroups(stops, LIMITS);
    const two = suggestGroups([...stops].reverse(), LIMITS);
    expect(ids(one.groups)).toEqual(ids(two.groups));
  });
});
