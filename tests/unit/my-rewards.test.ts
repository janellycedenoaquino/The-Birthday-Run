import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import {
  myRewards,
  REWARDS_PAGE_SIZE,
  type EnrolledRetailer,
} from "@/lib/rewards/my-rewards";

// BUILD F-4 (FR-12–FR-16): the S-105 views from plain data. Birthday Jun 15 throughout.
const d = (s: string) => s as LocalDate;
const JUN15 = { month: 6, day: 15 };
const retailer = (
  id: string,
  over: Partial<EnrolledRetailer> = {},
): EnrolledRetailer => ({
  id,
  name: id,
  reward_description: "Free thing",
  logo_file: null,
  timing_type: "from_birthday",
  days_before: null,
  days_after: 7,
  signup_lead_days: null,
  ...over,
});
const run = (
  today: string,
  enrolled: EnrolledRetailer[],
  filters = {},
  pickups: { retailerId: string; date: LocalDate }[] = [],
) =>
  myRewards({ birthday: JUN15, today: d(today), enrolled, pickups, filters });

describe("which view S-105 shows (FR-12, FR-15, FR-16)", () => {
  it("no programs → M-211, in or out of the window", () => {
    expect(run("2026-06-15", []).view).toBe("none");
    expect(run("2026-09-01", []).view).toBe("none");
  });

  it("outside the window → M-207, no list (FR-15)", () => {
    const r = run("2026-09-01", [retailer("a")]);
    expect(r.view).toBe("outside");
    expect(r.items).toEqual([]);
    expect(r.window.planning.start).toBe("2027-06-15");
  });

  it("in the window → only available rewards, by days left then name (FR-12)", () => {
    const r = run("2026-06-15", [
      retailer("zeta", { days_after: 3 }),
      retailer("alpha", { days_after: 3 }),
      retailer("month", { timing_type: "birth_month", days_after: null }),
      retailer("gone", { days_after: 1 }), // available on day 0 only
    ]);
    expect(r.view).toBe("list");
    expect(r.items.map((x) => [x.id, x.daysLeft])).toEqual([
      ["gone", 1],
      ["alpha", 3],
      ["zeta", 3],
      ["month", 16],
    ]);
  });

  it("expired and picked-up rewards are hidden; all gone → M-212", () => {
    const enrolled = [retailer("one", { days_after: 1 }), retailer("week")];
    expect(run("2026-06-16", enrolled).items.map((x) => x.id)).toEqual([
      "week",
    ]);
    expect(
      run("2026-06-16", enrolled, {}, [
        { retailerId: "week", date: d("2026-06-15") },
      ]).view,
    ).toBe("done");
  });
});

describe("Starting later and the progress count (decision 0018)", () => {
  it("lists this run's rewards not open yet, soonest first, and counts pickups", () => {
    // Today Jun 5: the window opened Jun 1 (14 days before); from-birthday ones open Jun 15.
    const r = run(
      "2026-06-05",
      [
        retailer("early", {
          timing_type: "around_birthday",
          days_before: 14,
          days_after: 7,
        }),
        retailer("zeta"),
        retailer("alpha"),
        retailer("got", {
          timing_type: "around_birthday",
          days_before: 14,
          days_after: 7,
        }),
      ],
      {},
      [{ retailerId: "got", date: d("2026-06-02") }],
    );
    expect(r.items.map((x) => x.id)).toEqual(["early"]);
    expect(r.later.map((x) => [x.id, x.opens])).toEqual([
      ["alpha", "2026-06-15"],
      ["zeta", "2026-06-15"],
    ]);
    expect(r.pickedUp).toBe(1);
  });

  it("counts rewards that ended unpicked (the ring's total keeps them)", () => {
    const r = run("2026-06-17", [
      retailer("one", { days_after: 1 }),
      retailer("week"),
    ]);
    expect(r.expired).toBe(1);
    expect(r.items.map((x) => x.id)).toEqual(["week"]);
  });

  it("counts open rewards ending within 3 days, whatever the filters", () => {
    const r = run(
      "2026-06-15",
      [
        retailer("a", { days_after: 1 }),
        retailer("b", { days_after: 3 }),
        retailer("c", { days_after: 4 }),
      ],
      { q: "c" },
    );
    expect(r.endingSoon).toBe(2);
  });

  it("no programs → nothing later", () => {
    expect(run("2026-06-05", []).later).toEqual([]);
  });
});

describe("filters and pages (FR-13)", () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    retailer(`r${String(i).padStart(2, "0")}`, { days_after: 1 + i }),
  );

  it("search and 'ends within' combine; counts are matched of available", () => {
    const r = run("2026-06-15", many, { q: "r0", within: 7 });
    expect(r.items.map((x) => x.id)).toEqual([
      "r00",
      "r01",
      "r02",
      "r03",
      "r04",
      "r05",
      "r06",
    ]);
    expect([r.matched, r.available]).toEqual([7, 25]);
  });

  it(`pages of ${REWARDS_PAGE_SIZE}; page 2 shows the first two pages; past the end is fine`, () => {
    expect(run("2026-06-15", many)).toMatchObject({ hasMore: true });
    expect(run("2026-06-15", many).items).toHaveLength(20);
    expect(run("2026-06-15", many, { page: 2 })).toMatchObject({
      hasMore: false,
    });
    expect(run("2026-06-15", many, { page: 2 }).items).toHaveLength(25);
    expect(run("2026-06-15", many, { page: 50 }).items).toHaveLength(25);
  });
});

describe("header state (FR-14)", () => {
  const month = [
    retailer("m", { timing_type: "birth_month", days_after: null }),
  ];
  it.each([
    ["2026-06-15", "birthday"],
    ["2026-06-01", "birth_month"], // before the birthday: the reward is open, nothing passed
    ["2026-06-20", "window_open"], // birthday passed, the month's reward still open (owner rule)
    ["2026-07-02", "other"], // birth-month reward closed; no other open
    ["2026-09-01", "other"],
  ])("%s → %s", (today, state) => {
    expect(run(today, month).header).toBe(state);
  });

  it("a later window day with a reward still open → window_open", () => {
    expect(
      run("2026-07-02", [retailer("long", { days_after: 20 })]).header,
    ).toBe("window_open");
  });
});
