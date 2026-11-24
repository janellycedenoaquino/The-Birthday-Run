import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import { remindersDue, type ReminderReward } from "@/lib/reminders/due";

// BUILD F-12 "Tests" (FR-41, A-9, D14): which reminders are due, from fixed dates. Birthday
// Jun 15, zone UTC; `at` is noon UTC on the given day.
const d = (s: string) => s as LocalDate;
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const reward = (
  id: string,
  timing_type = "from_birthday",
  days_after: number | null = 7,
): ReminderReward => ({
  retailer_id: id,
  name: id.toUpperCase(),
  reward_description: `${id} reward`,
  timing_type,
  days_before: null,
  days_after,
});
const base: Omit<Parameters<typeof remindersDue>[0], "now"> = {
  birthday: { month: 6, day: 15 },
  timeZone: "UTC",
  rewards: [reward("week"), reward("day", "from_birthday", 1)],
  pickups: [],
  lastExpiringOn: null,
  planAheadCycles: [],
};
const kinds = (day: string, over: Partial<typeof base> = {}) =>
  remindersDue({ ...base, ...over, now: at(day) }).due.map((r) => r.kind);

describe("plan ahead (E-101, from the earliest open or join-by day)", () => {
  it.each([
    ["2026-06-07", []], // 8 days before
    ["2026-06-08", ["plan_ahead"]], // 7 days before
    ["2026-06-14", ["plan_ahead"]], // 1 day before
  ])("%s → %o", (day, expected) => {
    expect(kinds(day)).toEqual(expected);
  });

  it("starts 2 days before the earliest reward opens (birth month opens Jun 1 → May 30)", () => {
    const rewards = [reward("month", "birth_month", null)];
    expect(kinds("2026-05-29", { rewards })).toEqual([]);
    expect(kinds("2026-05-30", { rewards })).toEqual(["plan_ahead"]);
  });

  it("starts before a join-by date, at most 32 days ahead (30-day lead → May 14)", () => {
    const rewards = [{ ...reward("joinme"), signup_lead_days: 30 }];
    expect(kinds("2026-05-13", { rewards })).toEqual([]);
    expect(kinds("2026-05-14", { rewards })).toEqual(["plan_ahead"]);
  });

  it("lists join-by and open dates for the email", () => {
    const rewards = [{ ...reward("joinme"), signup_lead_days: 7 }];
    const { due } = remindersDue({ ...base, rewards, now: at("2026-06-06") });
    expect(due[0]!.items[0]).toMatchObject({
      opens: "2026-06-15",
      joinBy: "2026-06-08",
    });
  });

  it("never on or after the birthday", () => {
    expect(kinds("2026-06-15")).not.toContain("plan_ahead");
    expect(kinds("2026-06-16")).not.toContain("plan_ahead");
  });

  it("once per cycle: not again once its cycle start is logged", () => {
    const first = remindersDue({ ...base, now: at("2026-06-08") });
    const cycle = first.due[0]!.cycleStart;
    expect(kinds("2026-06-09", { planAheadCycles: [cycle] })).toEqual([]);
  });

  it("lists every reward still to get, not picked-up ones, by last day", () => {
    const { due } = remindersDue({
      ...base,
      now: at("2026-06-10"),
      pickups: [{ retailerId: "week", date: d("2026-06-01") }],
    });
    expect(due[0]!.items.map((i) => i.retailerId)).toEqual(["day"]);
    expect(due[0]!.birthday).toBe("2026-06-15");
  });
});

describe("expiring (E-102)", () => {
  it("in the window with ≤ 3 days left; lists only those", () => {
    // Jun 18: "week" (Jun 15–21) has 4 days left, "day" ended Jun 15.
    expect(kinds("2026-06-18")).toEqual([]);
    const { due } = remindersDue({ ...base, now: at("2026-06-19") });
    expect(due.map((r) => r.kind)).toEqual(["expiring"]);
    expect(due[0]!.items).toEqual([
      expect.objectContaining({
        retailerId: "week",
        daysLeft: 3,
        lastDay: "2026-06-21",
      }),
    ]);
  });

  it("not again until 3 days after the last one (A-9)", () => {
    expect(kinds("2026-06-20", { lastExpiringOn: d("2026-06-19") })).toEqual(
      [],
    );
    expect(kinds("2026-06-21", { lastExpiringOn: d("2026-06-19") })).toEqual(
      [],
    );
    expect(kinds("2026-06-21", { lastExpiringOn: d("2026-06-18") })).toEqual([
      "expiring",
    ]);
  });

  it("a picked-up reward is never listed", () => {
    expect(
      kinds("2026-06-19", {
        pickups: [{ retailerId: "week", date: d("2026-06-16") }],
      }),
    ).toEqual([]);
  });

  it("uses the user's own date: 01:00 UTC on Jun 19 is still Jun 18 in New York", () => {
    expect(
      remindersDue({
        ...base,
        timeZone: "America/New_York",
        now: new Date("2026-06-19T01:00:00Z"),
      }).today,
    ).toBe("2026-06-18");
  });
});
