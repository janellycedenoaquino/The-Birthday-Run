import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import { initialsOf, joinByLine, timingLabel } from "@/lib/retailers/labels";

// C-102/S-104 labels (SPEC §3.4: M-181–M-184b, M-277, M-277b; FR-4, FR-49).
const d = (s: string) => s as LocalDate;

describe("timingLabel: all five types (FR-4)", () => {
  it.each([
    [{ type: "from_birthday", days: 1 }, "Birthday only"],
    [{ type: "from_birthday", days: 7 }, "7 days from your birthday"],
    [{ type: "birth_month" }, "All birth month"],
    [
      { type: "around_birthday", before: 7, after: 3 },
      "From 7 days before to 3 days after your birthday",
    ],
    [
      { type: "around_birthday", before: 1, after: 1 },
      "From 1 day before to 1 day after your birthday",
    ],
    [
      { type: "around_birthday", before: 3, after: 0 },
      "From 3 days before to your birthday",
    ],
    [
      { type: "month_start", days: 30 },
      "30 days from the 1st of your birth month",
    ],
    [
      { type: "month_start", days: 1 },
      "1 day from the 1st of your birth month",
    ],
    [
      { type: "to_month_end" },
      "From your birthday to the end of your birth month",
    ],
  ] as const)("%j", (timing, label) => {
    expect(timingLabel(timing)).toBe(label);
  });
});

describe("initialsOf (C-102)", () => {
  it.each([
    ["Starbucks", "S"],
    ["Bath & Body Works", "BB"],
    ["e.l.f. Cosmetics", "EC"],
    ["16 Handles", "1H"],
    ["!!!", "?"],
    ["", "?"],
  ])("%j → %j", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("joinByLine (FR-49)", () => {
  const base = {
    brand: "Starbucks",
    leadDays: 7,
    nextBirthday: d("2026-06-15"),
  };

  it("up to the join-by date: the date itself", () => {
    expect(joinByLine({ ...base, today: d("2026-06-01") })).toBe(
      "Join by Monday, June 8 to get this one.",
    );
    expect(joinByLine({ ...base, today: d("2026-06-08") })).toBe(
      "Join by Monday, June 8 to get this one.",
    );
  });

  it("after it: may not come this year", () => {
    expect(joinByLine({ ...base, today: d("2026-06-09") })).toBe(
      "Starbucks needs members to join 7 days before the birthday, so it may not come this year.",
    );
  });
});
