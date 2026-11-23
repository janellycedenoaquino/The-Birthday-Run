import { describe, expect, it } from "vitest";
import { filterRetailers, type FilterRow } from "@/lib/retailers/filter";

// BUILD F-3 "Tests": FR-3 (search + category), FR-5 (state), FR-45 (exclusive length buckets,
// separate "starts early" toggle). Birthday Jun 15 unless a case says otherwise.
const row = (id: string, over: Partial<FilterRow> = {}): FilterRow => ({
  id,
  name: id,
  category: "food_drink",
  timing_type: "from_birthday",
  days_before: null,
  days_after: 7,
  states_scope: "all",
  state_codes: [],
  ...over,
});
const JUN15 = { birthday: { month: 6, day: 15 } };
const ids = (r: { shown: FilterRow[] }) => r.shown.map((x) => x.id);

describe("search and category (FR-3)", () => {
  const rows = [
    row("haagen-dazs", { name: "Häagen-Dazs" }),
    row("starbucks", { name: "Starbucks" }),
    row("sephora", { name: "Sephora", category: "beauty" }),
  ];

  it("search ignores case and accents and matches inside the name", () => {
    expect(ids(filterRetailers(rows, { q: "haagen" }, {}))).toEqual([
      "haagen-dazs",
    ]);
    expect(ids(filterRetailers(rows, { q: "BUCK" }, {}))).toEqual([
      "starbucks",
    ]);
  });

  it("search and category combine; no filters returns everything", () => {
    expect(
      ids(filterRetailers(rows, { q: "s", category: "beauty" }, {})),
    ).toEqual(["sephora"]);
    expect(filterRetailers(rows, {}, {})).toMatchObject({
      total: 3,
      hiddenByState: 0,
    });
    expect(ids(filterRetailers(rows, {}, {}))).toHaveLength(3);
  });

  it("no match → an empty list, total unchanged", () => {
    expect(filterRetailers(rows, { q: "zzz" }, {})).toMatchObject({
      shown: [],
      total: 3,
    });
  });
});

describe("length buckets are exclusive (FR-45)", () => {
  const rows = [
    row("one", { days_after: 1 }),
    row("two", { days_after: 2 }),
    row("seven", { days_after: 7 }),
    row("eight", { days_after: 8 }),
    row("month", { timing_type: "birth_month", days_after: null }),
    row("around", {
      timing_type: "around_birthday",
      days_before: 3,
      days_after: 3,
    }), // 7 days
  ];

  it("day = 1-day only; week = 2–7; longer = 8+ and birth month", () => {
    expect(ids(filterRetailers(rows, { length: "day" }, JUN15))).toEqual([
      "one",
    ]);
    expect(ids(filterRetailers(rows, { length: "week" }, JUN15))).toEqual([
      "two",
      "seven",
      "around",
    ]);
    expect(ids(filterRetailers(rows, { length: "longer" }, JUN15))).toEqual([
      "eight",
      "month",
    ]);
  });

  it("early keeps rewards that open before the birthday, and combines with a bucket", () => {
    expect(ids(filterRetailers(rows, { early: true }, JUN15))).toEqual([
      "month",
      "around",
    ]);
    expect(
      ids(filterRetailers(rows, { early: true, length: "week" }, JUN15)),
    ).toEqual(["around"]);
  });

  it("birth month doesn't open early for a birthday on the 1st", () => {
    expect(
      ids(
        filterRetailers(
          rows,
          { early: true },
          { birthday: { month: 6, day: 1 } },
        ),
      ),
    ).toEqual(["around"]);
  });

  it("without a birthday the length and early filters are ignored", () => {
    expect(
      ids(filterRetailers(rows, { length: "day", early: true }, {})),
    ).toHaveLength(6);
  });
});

describe("state (FR-5)", () => {
  const rows = [
    row("everywhere", { states_scope: "all" }),
    row("unknown", { states_scope: "unknown" }),
    row("ny-only", { states_scope: "listed", state_codes: ["NY"] }),
    row("ca-only", { states_scope: "listed", state_codes: ["CA", "NV"] }),
  ];

  it("keeps all, unknown and listed-with-the-state; counts the hidden ones", () => {
    const r = filterRetailers(rows, { state: "NY" }, {});
    expect(ids(r)).toEqual(["everywhere", "unknown", "ny-only"]);
    expect(r).toMatchObject({ total: 4, hiddenByState: 1 });
  });

  it("hiddenByState counts only state, not the other filters", () => {
    const r = filterRetailers(rows, { state: "NY", q: "every" }, {});
    expect(ids(r)).toEqual(["everywhere"]);
    expect(r.hiddenByState).toBe(1);
  });
});
