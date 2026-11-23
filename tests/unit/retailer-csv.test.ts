import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  parseRetailerCsv,
  readCsv,
} from "@/lib/retailers/csv-schema";

// BUILD F-1 "Tests": FR-1 (bad rows rejected with their row number), FR-46 (dates, sources).
const TODAY = "2026-11-23";
const HEADER = CSV_COLUMNS.join(",");

type Cells = Partial<Record<(typeof CSV_COLUMNS)[number], string>>;
const base: Record<(typeof CSV_COLUMNS)[number], string> = {
  id: "cafe-one",
  name: "Cafe One",
  category: "food_drink",
  description: "Coffee shop",
  reward_description: "Free drink",
  timing_type: "from_birthday",
  days_before: "",
  days_after: "7",
  reward_type: "free_item",
  requires_purchase: "no",
  purchase_requirement: "",
  membership_requirement: "Rewards member",
  other_requirement: "",
  logo_file: "cafe-one.png",
  website_url: "https://cafe.example",
  store_finder_url: "",
  states: "all",
  is_popular: "yes",
  last_checked_on: "2026-11-01",
  source_url: "https://cafe.example/rewards",
};
const line = (cells: Cells = {}) =>
  CSV_COLUMNS.map((c) => {
    const v = cells[c] ?? base[c];
    return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  }).join(",");
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";
const parse = (text: string) => parseRetailerCsv(text, { today: TODAY });
const errorsOf = (text: string) => {
  const r = parse(text);
  return r.ok ? [] : r.errors;
};

describe("parseRetailerCsv: valid input (FR-1)", () => {
  it("parses a valid row into DESIGN §3 columns", () => {
    const r = parse(csv(line()));
    expect(r).toEqual({
      ok: true,
      rows: [
        {
          id: "cafe-one",
          name: "Cafe One",
          category: "food_drink",
          description: "Coffee shop",
          reward_description: "Free drink",
          timing_type: "from_birthday",
          days_before: null,
          days_after: 7,
          reward_type: "free_item",
          requires_purchase: false,
          purchase_requirement: null,
          membership_requirement: "Rewards member",
          other_requirement: null,
          logo_file: "cafe-one.png",
          website_url: "https://cafe.example",
          store_finder_url: null,
          states_scope: "all",
          state_codes: [],
          is_popular: true,
          last_checked_on: "2026-11-01",
          source_url: "https://cafe.example/rewards",
        },
      ],
    });
  });

  it("maps states: empty = unknown, ;-list = listed", () => {
    const r = parse(
      csv(
        line({ id: "a", name: "A", states: "" }),
        line({ id: "b", name: "B", states: "NY;NJ" }),
      ),
    );
    expect(r.ok && r.rows.map((x) => [x.states_scope, x.state_codes])).toEqual([
      ["unknown", []],
      ["listed", ["NY", "NJ"]],
    ]);
  });

  it("accepts birth_month and around_birthday at the 31-day limit", () => {
    const r = parse(
      csv(
        line({
          id: "a",
          name: "A",
          timing_type: "birth_month",
          days_after: "",
        }),
        line({
          id: "b",
          name: "B",
          timing_type: "around_birthday",
          days_before: "15",
          days_after: "15",
        }),
        line({ id: "c", name: "C", days_after: "1" }),
        line({ id: "d", name: "D", days_after: "31" }),
      ),
    );
    expect(r.ok).toBe(true);
  });

  it("handles quoted commas, doubled quotes, newlines in quotes and CRLF", () => {
    const text = [
      HEADER,
      line({
        description: 'Big, "fancy" cafe',
        reward_description: "Free\ndrink",
      }),
      line({ id: "two", name: "Two" }),
    ].join("\r\n");
    const r = parse(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]!.description).toBe('Big, "fancy" cafe');
    expect(r.rows[0]!.reward_description).toBe("Free\ndrink");
    expect(r.rows[1]!.id).toBe("two");
  });

  it("skips blank lines and a UTF-8 BOM", () => {
    expect(parse("﻿" + csv(line()) + "\n\n").ok).toBe(true);
  });
});

describe("parseRetailerCsv: bad rows give their row number (FR-1, FR-46)", () => {
  it.each<[string, Cells, string, string]>([
    ["missing required field", { name: "" }, "name", "required"],
    ["unknown category", { category: "shoes" }, "category", "invalid_enum"],
    [
      "unknown reward type",
      { reward_type: "cash" },
      "reward_type",
      "invalid_enum",
    ],
    [
      "bad boolean",
      { requires_purchase: "true" },
      "requires_purchase",
      "invalid_enum",
    ],
    ["bad state code", { states: "NY;XX" }, "states", "state_code"],
    ["duplicate state code", { states: "NY;NY" }, "states", "state_code"],
    ["from_birthday 0 days", { days_after: "0" }, "timing_type", "timing"],
    ["from_birthday 32 days", { days_after: "32" }, "timing_type", "timing"],
    [
      "from_birthday with days_before",
      { days_before: "2" },
      "timing_type",
      "timing",
    ],
    [
      "around_birthday over 31",
      { timing_type: "around_birthday", days_before: "16", days_after: "15" },
      "timing_type",
      "timing",
    ],
    [
      "around_birthday 0 before",
      { timing_type: "around_birthday", days_before: "0", days_after: "5" },
      "timing_type",
      "timing",
    ],
    [
      "birth_month with days",
      { timing_type: "birth_month", days_after: "7" },
      "timing_type",
      "timing",
    ],
    ["non-number days", { days_after: "7d" }, "days_after", "invalid"],
    [
      "http: website",
      { website_url: "http://cafe.example" },
      "website_url",
      "url_scheme",
    ],
    [
      "http: source",
      { source_url: "http://cafe.example" },
      "source_url",
      "url_scheme",
    ],
    ["missing source", { source_url: "" }, "source_url", "required"],
    [
      "bare https:// source",
      { source_url: "https://" },
      "source_url",
      "url_scheme",
    ],
    [
      "bad date format",
      { last_checked_on: "11/01/2026" },
      "last_checked_on",
      "date_format",
    ],
    [
      "impossible date",
      { last_checked_on: "2026-02-30" },
      "last_checked_on",
      "date_format",
    ],
    [
      "future date",
      { last_checked_on: "2026-11-24" },
      "last_checked_on",
      "future_date",
    ],
    ["bad id", { id: "Cafe One" }, "id", "invalid"],
    ["bad logo file", { logo_file: "cafe.jpg" }, "logo_file", "invalid"],
  ])("%s", (_, cells, column, code) => {
    // Row 3: the bad record comes after one good one.
    expect(errorsOf(csv(line({ id: "ok", name: "Ok" }), line(cells)))).toEqual([
      { row: 3, column, code },
    ]);
  });

  it("duplicate id and duplicate name (case-insensitive)", () => {
    expect(
      errorsOf(
        csv(
          line(),
          line({ name: "Other" }),
          line({ id: "x", name: "CAFE ONE" }),
        ),
      ),
    ).toEqual([
      { row: 3, column: "id", code: "duplicate_id" },
      { row: 4, column: "name", code: "duplicate_name" },
    ]);
  });

  it("row numbers count lines, so a multi-line quoted field moves later rows down", () => {
    const text = csv(
      line({ reward_description: "a\nb\nc" }),
      line({ id: "y", name: "Y", category: "x" }),
    );
    expect(errorsOf(text)).toEqual([
      { row: 5, column: "category", code: "invalid_enum" },
    ]);
  });

  it("wrong number of fields", () => {
    expect(errorsOf(csv(line() + ",extra"))).toEqual([
      { row: 2, code: "column_count" },
    ]);
  });

  it("unknown, missing or repeated header", () => {
    expect(errorsOf(HEADER + ",colour\n")).toEqual([
      { row: 1, column: "colour", code: "unknown_header" },
    ]);
    expect(errorsOf(HEADER.replace(",is_popular", "") + "\n")).toEqual([
      { row: 1, column: "is_popular", code: "missing_header" },
    ]);
    expect(errorsOf(HEADER + ",name\n")).toEqual([
      { row: 1, column: "name", code: "duplicate_header" },
    ]);
    expect(errorsOf("")).toEqual([{ row: 1, code: "missing_header" }]);
  });

  it("malformed quoting is refused, not guessed", () => {
    expect(errorsOf(csv('"open quote,' + line()))).toEqual([
      { row: 2, code: "malformed_csv" },
    ]);
    expect(errorsOf(csv('"a"b,' + line()))).toEqual([
      { row: 2, code: "malformed_csv" },
    ]);
    expect(errorsOf(csv('a"b,' + line()))).toEqual([
      { row: 2, code: "malformed_csv" },
    ]);
  });
});

describe("readCsv", () => {
  it("keeps empty fields and a final record without a newline", () => {
    expect(readCsv('a,,""\nb')).toEqual({
      ok: true,
      records: [
        { line: 1, fields: ["a", "", ""] },
        { line: 2, fields: ["b"] },
      ],
    });
  });
});
