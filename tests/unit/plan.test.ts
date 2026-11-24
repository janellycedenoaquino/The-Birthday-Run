import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import {
  defaultPickup,
  endingBefore,
  outsideWindow,
  pickupProblem,
  plannable,
  type PlanRetailer,
} from "@/lib/rewards/plan";

// BUILD F-6 "Tests" (FR-22, FR-23, FR-9). Birthday Jun 15.
const d = (s: string) => s as LocalDate;
const JUN15 = { month: 6, day: 15 };
const r = (
  id: string,
  days_after: number | null = 7,
  timing_type = "from_birthday",
): PlanRetailer => ({
  id,
  name: id,
  logo_file: null,
  timing_type,
  days_before: null,
  days_after,
});

describe("plannable (FR-22)", () => {
  it("keeps expired ones in `all` (a group can still hold them), not in the list", () => {
    const { rows, all } = plannable({
      birthday: JUN15,
      today: d("2026-06-17"),
      enrolled: [r("one", 1), r("week")],
      pickups: [],
    });
    expect(rows.map((x) => x.id)).toEqual(["week"]);
    expect(all.map((x) => x.id)).toEqual(["one", "week"]);
  });

  it("in the window: expired hidden, picked up shown but marked, days left for open ones", () => {
    const { rows, window } = plannable({
      birthday: JUN15,
      today: d("2026-06-17"),
      enrolled: [
        r("one", 1),
        r("week"),
        r("done"),
        r("month", null, "birth_month"),
      ],
      pickups: [{ retailerId: "done", date: d("2026-06-15") }],
    });
    expect(window.inWindow).toBe(true);
    expect(rows.map((x) => [x.id, x.pickedUp, x.daysLeft])).toEqual([
      ["done", true, null],
      ["month", false, 14],
      ["week", false, 5],
    ]);
  });

  it("outside the window: every enrolled reward, for next year, no days left", () => {
    const { rows, window } = plannable({
      birthday: JUN15,
      today: d("2026-09-01"),
      enrolled: [r("one", 1), r("week")],
      pickups: [{ retailerId: "week", date: d("2026-06-15") }], // last cycle's: doesn't count
    });
    expect(window.inWindow).toBe(false);
    expect(rows.map((x) => [x.id, x.pickedUp, x.daysLeft, x.closes])).toEqual([
      ["one", false, null, "2027-06-15"],
      ["week", false, null, "2027-06-21"],
    ]);
  });
});

describe("pickupProblem (FR-23)", () => {
  const w = plannable({
    birthday: JUN15,
    today: d("2026-06-17"),
    enrolled: [r("week")],
    pickups: [],
  }).window;

  it("inside the window from now to its end is fine", () => {
    expect(pickupProblem(w, d("2026-06-17"), "15:00", "14:59")).toBeNull();
    expect(pickupProblem(w, d("2026-07-15"), "09:00", "14:59")).toBeNull();
  });

  it.each([
    ["yesterday", "2026-06-16", "12:00"],
    ["earlier today", "2026-06-17", "14:00"],
    ["after the window", "2026-07-16", "12:00"],
  ])("%s → BR-8 with the range", (_, date, time) => {
    expect(pickupProblem(w, d(date), time, "14:59")).toEqual({
      start: "2026-06-17",
      end: "2026-07-15",
    });
  });

  it("outside the window, the next window is the range", () => {
    const out = plannable({
      birthday: JUN15,
      today: d("2026-09-01"),
      enrolled: [r("week")],
      pickups: [],
    }).window;
    expect(pickupProblem(out, d("2027-06-15"), "12:00", "08:00")).toBeNull();
    expect(pickupProblem(out, d("2026-09-02"), "12:00", "08:00")).toEqual({
      start: "2027-06-15",
      end: "2027-07-15",
    });
  });
});

describe("endingBefore (M-227) and outsideWindow (FR-9)", () => {
  const { rows, window } = plannable({
    birthday: JUN15,
    today: d("2026-06-15"),
    enrolled: [r("one", 1), r("week")],
    pickups: [],
  });

  it("lists the rewards that end before the pickup date", () => {
    expect(endingBefore(rows, d("2026-06-18"))).toEqual(["one"]);
    expect(endingBefore(rows, d("2026-06-15"))).toEqual([]);
  });

  it("flags a pickup outside the window being planned", () => {
    expect(outsideWindow(window, d("2026-07-15"))).toBe(false);
    expect(outsideWindow(window, d("2026-07-16"))).toBe(true);
    expect(outsideWindow(window, d("2026-06-14"))).toBe(true);
  });
});

describe("defaultPickup (FR-23)", () => {
  const w = plannable({
    birthday: JUN15,
    today: d("2026-06-17"),
    enrolled: [r("week")],
    pickups: [],
  }).window;
  it("the next whole hour today, or noon tomorrow once it's late", () => {
    expect(defaultPickup(w, "14:20")).toEqual({
      date: "2026-06-17",
      time: "15:00",
    });
    expect(defaultPickup(w, "23:10")).toEqual({
      date: "2026-06-18",
      time: "12:00",
    });
  });
  it("the window's last day after 23:00: the last minute of today, never the past", () => {
    // Birthday Jun 15, only a 1-day reward: the window ends Jul 15 (day 30).
    const last = plannable({
      birthday: JUN15,
      today: d("2026-07-15"),
      enrolled: [r("one", 1)],
      pickups: [],
    }).window;
    expect(defaultPickup(last, "23:15")).toEqual({
      date: "2026-07-15",
      time: "23:59",
    });
  });

  it("outside the window: noon on the next window's first day", () => {
    const out = plannable({
      birthday: JUN15,
      today: d("2026-09-01"),
      enrolled: [r("week")],
      pickups: [],
    }).window;
    expect(defaultPickup(out, "14:20")).toEqual({
      date: "2027-06-15",
      time: "12:00",
    });
  });
});
