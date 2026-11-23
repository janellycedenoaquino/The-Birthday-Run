import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import {
  historySections,
  pickupStats,
  type HistoryPickup,
} from "@/lib/rewards/history";

// BUILD F-5 / F-4 "Tests": FR-19 (cycles, newest first, upcoming shown, none → empty), FR-21
// (the dashboard count equals History's current cycle).
const d = (s: string) => s as LocalDate;
const DEC20 = { month: 12, day: 20 };
const week = [{ type: "from_birthday" as const, days: 7 }];
const pickup = (id: string, date: string): HistoryPickup => ({
  id,
  retailer: id,
  date: d(date),
  note: null,
  locationLabel: null,
});

describe("historySections (FR-19)", () => {
  it("none ever → no sections (M-253)", () => {
    expect(
      historySections({
        birthday: DEC20,
        timings: week,
        today: d("2027-01-05"),
        pickups: [],
      }),
    ).toEqual([]);
  });

  it("a Jan 5 pickup with a Dec 20 birthday is under the previous year; newest first", () => {
    const sections = historySections({
      birthday: DEC20,
      timings: week,
      today: d("2027-01-05"),
      pickups: [
        pickup("old", "2025-12-21"),
        pickup("jan", "2027-01-05"),
        pickup("dec", "2026-12-22"),
      ],
    });
    expect(sections.map((s) => [s.year, s.items.map((i) => i.id)])).toEqual([
      [2026, ["jan", "dec"]],
      [2025, ["old"]],
    ]);
  });

  it("the upcoming cycle shows even when empty (M-252)", () => {
    const sections = historySections({
      birthday: DEC20,
      timings: week,
      today: d("2027-03-01"), // outside the window: planning is the 2027 cycle
      pickups: [pickup("dec", "2026-12-22")],
    });
    expect(sections.map((s) => [s.year, s.items.length])).toEqual([
      [2027, 0],
      [2026, 1],
    ]);
  });
});

describe("pickupStats (FR-21)", () => {
  it("counts this cycle like History does, across New Year, and gives the latest date", () => {
    const dates = [d("2025-12-21"), d("2026-12-22"), d("2027-01-05")];
    const stats = pickupStats({
      birthday: DEC20,
      timings: week,
      today: d("2027-01-05"),
      dates,
    });
    expect(stats).toEqual({ thisCycle: 2, last: "2027-01-05" });
    const sections = historySections({
      birthday: DEC20,
      timings: week,
      today: d("2027-01-05"),
      pickups: dates.map((x, i) => pickup(String(i), x)),
    });
    expect(sections[0]!.items).toHaveLength(stats.thisCycle);
  });

  it("no pickups → 0 and no date (M-128)", () => {
    expect(
      pickupStats({
        birthday: DEC20,
        timings: week,
        today: d("2027-01-05"),
        dates: [],
      }),
    ).toEqual({
      thisCycle: 0,
      last: null,
    });
  });
});
