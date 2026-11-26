import { describe, expect, it } from "vitest";
import {
  addDays,
  monthsBefore,
  isoDaysBefore,
  isoFromUnix,
  localDateOf,
  birthdayIn,
  compareDates,
  cycleFor,
  daysLeft,
  formatDate,
  headerState,
  isValidMonthDay,
  isWithinMinutes,
  joinByDate,
  localTime,
  pickupDateRange,
  planRange,
  rewardDays,
  rewardStatus,
  timingOf,
  today,
  windowFor,
  type Birthday,
  type LocalDate,
  type Timing,
} from "@/lib/birthday/timing";

// BUILD F-2 "Tests" (FR-6, FR-10, D4). Every case goes through the public interface only, with
// a fixed `now`; expected values are worked out by hand from the calendar, not recomputed.
const d = (s: string) => s as LocalDate;

describe("isValidMonthDay (FR-6)", () => {
  it.each([
    [2, 29, true],
    [2, 28, true],
    [1, 31, true],
    [12, 31, true],
    [2, 30, false],
    [4, 31, false],
    [6, 31, false],
    [0, 1, false],
    [13, 1, false],
    [1, 0, false],
    [1, 32, false],
    [1.5, 1, false],
    [1, 1.5, false],
  ])("month %d day %d → %s", (month, day, ok) => {
    expect(isValidMonthDay(month, day)).toBe(ok);
  });
});

describe("addDays and compareDates (D4: UTC-midnight day numbers)", () => {
  it.each([
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-03-08", 1, "2026-03-09"], // US daylight saving starts: still one day
    ["2026-11-01", 1, "2026-11-02"], // US daylight saving ends
    ["2026-05-10", 0, "2026-05-10"],
    ["2026-01-01", 365, "2027-01-01"],
  ])("%s + %d = %s", (start, n, end) => {
    expect(addDays(d(start), n)).toBe(end);
  });

  it("orders dates", () => {
    expect(compareDates(d("2026-12-31"), d("2027-01-01"))).toBeLessThan(0);
    expect(compareDates(d("2027-01-01"), d("2026-12-31"))).toBeGreaterThan(0);
    expect(compareDates(d("2026-06-15"), d("2026-06-15"))).toBe(0);
    // The difference in days, so callers can ask "how many days apart".
    expect(compareDates(d("2027-01-05"), d("2026-12-20"))).toBe(16);
  });
});

describe("monthsBefore (FR-47: the 6-month staleness cutoff)", () => {
  it.each([
    ["2026-11-15", 6, "2026-05-15"],
    ["2026-03-10", 6, "2025-09-10"], // across the year
    ["2026-08-31", 6, "2026-02-28"], // clamped to the month's end
    ["2028-08-31", 6, "2028-02-29"], // leap year
    ["2026-12-31", 6, "2026-06-30"],
    ["2026-05-01", 0, "2026-05-01"],
  ])("%s − %d months = %s", (start, n, end) => {
    expect(monthsBefore(d(start), n)).toBe(end);
  });
});

describe("Stripe instants (F-8)", () => {
  it("isoFromUnix: seconds → ISO", () => {
    expect(isoFromUnix(1_800_000_000)).toBe("2027-01-15T08:00:00.000Z");
  });
  it("isoDaysBefore: 30 days of 24 h", () => {
    expect(isoDaysBefore(new Date("2026-03-31T12:00:00Z"), 30)).toBe(
      "2026-03-01T12:00:00.000Z",
    );
  });
  it("localDateOf: the date in the user's zone, not UTC's", () => {
    expect(localDateOf("2026-12-01T03:00:00Z", "America/New_York")).toBe(
      "2026-11-30",
    );
    expect(localDateOf("2026-12-01T03:00:00Z", "UTC")).toBe("2026-12-01");
  });
});

describe("today and localTime (FR-10, D4)", () => {
  const at = (iso: string) => new Date(iso);

  it("23:30 UTC is the next day in Tokyo and the same day in New York", () => {
    const now = at("2026-06-15T23:30:00Z");
    expect(today("Asia/Tokyo", now)).toBe("2026-06-16");
    expect(localTime("Asia/Tokyo", now)).toBe("08:30");
    expect(today("America/New_York", now)).toBe("2026-06-15");
    expect(localTime("America/New_York", now)).toBe("19:30");
    expect(today("UTC", now)).toBe("2026-06-15");
  });

  it("midnight shows as 00:00, not 24:00", () => {
    expect(localTime("UTC", at("2026-06-15T00:00:00Z"))).toBe("00:00");
  });

  it("a daylight-saving change day gives one date per instant", () => {
    // New York falls back on 2026-11-01 at 02:00 EDT (06:00 UTC); 01:30 happens twice.
    expect(today("America/New_York", at("2026-11-01T05:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(localTime("America/New_York", at("2026-11-01T05:30:00Z"))).toBe(
      "01:30",
    );
    expect(today("America/New_York", at("2026-11-01T06:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(localTime("America/New_York", at("2026-11-01T06:30:00Z"))).toBe(
      "01:30",
    );
    // Springs forward on 2026-03-08: 02:30 local doesn't exist, 07:30 UTC is 03:30 EDT.
    expect(localTime("America/New_York", at("2026-03-08T07:30:00Z"))).toBe(
      "03:30",
    );
    expect(today("America/New_York", at("2026-03-08T04:59:00Z"))).toBe(
      "2026-03-07",
    );
  });

  it("handles half- and quarter-hour offsets", () => {
    const now = at("2026-06-15T18:20:00Z");
    expect(localTime("Asia/Kolkata", now)).toBe("23:50"); // +5:30
    expect(today("Asia/Kolkata", now)).toBe("2026-06-15");
    expect(localTime("Asia/Kathmandu", now)).toBe("00:05"); // +5:45
    expect(today("Asia/Kathmandu", now)).toBe("2026-06-16");
  });

  it("the two sides of the date line are two days apart", () => {
    // Kiritimati is UTC+14; "Etc/GMT+12" is UTC−12 (POSIX signs are reversed).
    const now = at("2026-06-15T11:00:00Z");
    expect(today("Pacific/Kiritimati", now)).toBe("2026-06-16");
    expect(today("Etc/GMT+12", now)).toBe("2026-06-14");
  });

  it("follows the zone it's given, not the machine's (FR-10: the profile's zone)", () => {
    // The same instant, read for a user whose profile says Los Angeles, even on a server in UTC.
    const now = at("2026-06-16T03:00:00Z");
    expect(today("America/Los_Angeles", now)).toBe("2026-06-15");
  });

  it("New Year's Eve in Los Angeles is already New Year's Day in UTC", () => {
    const now = at("2027-01-01T05:00:00Z");
    expect(today("America/Los_Angeles", now)).toBe("2026-12-31");
    expect(today("UTC", now)).toBe("2027-01-01");
  });
});

// ---- Steps 2–5: birthdays, windows, statuses (FR-10, FR-11, FR-12, FR-14, FR-17, FR-19, FR-23) ----
const JUN15: Birthday = { month: 6, day: 15 };
const fromBirthday = (days: number): Timing => ({
  type: "from_birthday",
  days,
});
const BIRTH_MONTH: Timing = { type: "birth_month" };
const around = (before: number, after: number): Timing => ({
  type: "around_birthday",
  before,
  after,
});
const monthStart = (days: number): Timing => ({ type: "month_start", days });
const TO_MONTH_END: Timing = { type: "to_month_end" };

describe("birthdayIn (FR-10)", () => {
  it("Feb 29 is Feb 28 in a non-leap year and Feb 29 in a leap year", () => {
    const feb29 = { month: 2, day: 29 };
    expect(birthdayIn(2027, feb29)).toBe("2027-02-28");
    expect(birthdayIn(2028, feb29)).toBe("2028-02-29");
    expect(birthdayIn(2100, feb29)).toBe("2100-02-28"); // not a leap year
    expect(birthdayIn(2000, feb29)).toBe("2000-02-29"); // is one
    expect(birthdayIn(2026, JUN15)).toBe("2026-06-15");
  });
});

describe("timingOf (FR-11): DB row → Timing", () => {
  it("maps each of the five types", () => {
    const row = (timing_type: string, b: number | null, a: number | null) => ({
      timing_type,
      days_before: b,
      days_after: a,
    });
    expect(timingOf(row("from_birthday", null, 7))).toEqual(fromBirthday(7));
    expect(timingOf(row("birth_month", null, null))).toEqual(BIRTH_MONTH);
    expect(timingOf(row("around_birthday", 7, 3))).toEqual(around(7, 3));
    expect(timingOf(row("month_start", null, 30))).toEqual(monthStart(30));
    expect(timingOf(row("to_month_end", null, null))).toEqual(TO_MONTH_END);
  });

  it.each([
    ["from_birthday with days_before", "from_birthday", 5, 3],
    ["from_birthday 0 days", "from_birthday", null, 0],
    ["from_birthday 32 days", "from_birthday", null, 32],
    ["birth_month with days", "birth_month", 5, 3],
    ["to_month_end with days", "to_month_end", null, 1],
    ["around 0 before", "around_birthday", 0, 3],
    ["around over 31 in total", "around_birthday", 16, 15],
    ["month_start with no days", "month_start", null, null],
  ])("refuses %s (FR-1)", (_, timing_type, days_before, days_after) => {
    expect(() =>
      timingOf({ timing_type, days_before, days_after } as never),
    ).toThrow();
  });

  it("throws on a row the DB check would have refused", () => {
    expect(() =>
      timingOf({
        timing_type: "from_birthday",
        days_before: null,
        days_after: null,
      }),
    ).toThrow();
    expect(() =>
      timingOf({ timing_type: "weekly", days_before: null, days_after: 1 }),
    ).toThrow();
  });
});

describe("rewardDays (FR-11): the days a reward can be used", () => {
  it.each<[string, Timing, string, string, string]>([
    [
      "from_birthday 1 = the birthday only",
      fromBirthday(1),
      "2026-06-15",
      "2026-06-15",
      "2026-06-15",
    ],
    [
      "from_birthday 7 = days 0–6",
      fromBirthday(7),
      "2026-06-15",
      "2026-06-15",
      "2026-06-21",
    ],
    [
      "birth_month, birthday on the 25th",
      BIRTH_MONTH,
      "2026-01-25",
      "2026-01-01",
      "2026-01-31",
    ],
    [
      "birth_month, Feb 29 birthday in 2027",
      BIRTH_MONTH,
      "2027-02-28",
      "2027-02-01",
      "2027-02-28",
    ],
    [
      "birth_month, Feb 29 birthday in 2028",
      BIRTH_MONTH,
      "2028-02-29",
      "2028-02-01",
      "2028-02-29",
    ],
    ["around 7/3", around(7, 3), "2026-06-15", "2026-06-08", "2026-06-18"],
    [
      "around 7/0 across New Year",
      around(7, 0),
      "2027-01-02",
      "2026-12-26",
      "2027-01-02",
    ],
    [
      "month_start 30 in June",
      monthStart(30),
      "2026-06-15",
      "2026-06-01",
      "2026-06-30",
    ],
    [
      "month_start 30 in February runs into March",
      monthStart(30),
      "2027-02-10",
      "2027-02-01",
      "2027-03-02",
    ],
    [
      "to_month_end, birthday on the 25th",
      TO_MONTH_END,
      "2026-06-25",
      "2026-06-25",
      "2026-06-30",
    ],
    [
      "to_month_end, birthday on the last day",
      TO_MONTH_END,
      "2026-06-30",
      "2026-06-30",
      "2026-06-30",
    ],
    [
      "to_month_end, Feb 29 birthday in 2027",
      TO_MONTH_END,
      "2027-02-28",
      "2027-02-28",
      "2027-02-28",
    ],
  ])("%s", (_, t, occurrence, opens, closes) => {
    expect(rewardDays(t, d(occurrence))).toEqual({ opens, closes });
  });
});

describe("windowFor (FR-10)", () => {
  it("day 0 and day 30 are in the window; day 31 is out with short rewards", () => {
    const t = [fromBirthday(7)];
    const w0 = windowFor(JUN15, t, d("2026-06-15"));
    expect(w0).toMatchObject({
      inWindow: true,
      dayNumber: 0,
      daysUntilBirthday: 0,
    });
    expect(w0.current).toMatchObject({
      birthday: "2026-06-15",
      start: "2026-06-15",
      end: "2026-07-15",
    });
    expect(windowFor(JUN15, t, d("2026-07-15"))).toMatchObject({
      inWindow: true,
      dayNumber: 30,
    });

    const w31 = windowFor(JUN15, t, d("2026-07-16"));
    // Outside the window the day counts toward the next birthday (SPEC Terms: negative before it).
    expect(w31).toMatchObject({ inWindow: false, dayNumber: -334 });
    expect(w31.planning.birthday).toBe("2027-06-15");
    expect(w31.daysUntilBirthday).toBe(334);
  });

  it("day 31 is in when a reward closes later (synthetic 40 days; FR-1's cap isn't the module's job)", () => {
    const w = windowFor(JUN15, [fromBirthday(40)], d("2026-07-16"));
    expect(w.inWindow).toBe(true);
    expect(w.current.end).toBe("2026-07-24");
  });

  it("day −1: out with only from_birthday; in with an early reward or the birth month", () => {
    const out = windowFor(JUN15, [fromBirthday(7)], d("2026-06-14"));
    expect(out).toMatchObject({
      inWindow: false,
      dayNumber: -1,
      daysUntilBirthday: 1,
      nextBirthday: "2026-06-15",
    });
    expect(windowFor(JUN15, [], d("2026-06-01")).dayNumber).toBe(-14);
    expect(out.planning.birthday).toBe("2026-06-15");

    const early = windowFor(JUN15, [around(7, 3)], d("2026-06-14"));
    expect(early).toMatchObject({ inWindow: true, dayNumber: -1 });
    expect(early.current.start).toBe("2026-06-08");

    const month = windowFor(JUN15, [BIRTH_MONTH], d("2026-06-14"));
    expect(month).toMatchObject({ inWindow: true, dayNumber: -1 });
    expect(month.current.start).toBe("2026-06-01");
  });

  it("crosses New Year: birthday Dec 20, today Jan 5 → day 16, in", () => {
    const w = windowFor(
      { month: 12, day: 20 },
      [fromBirthday(7)],
      d("2027-01-05"),
    );
    expect(w).toMatchObject({ inWindow: true, dayNumber: 16 });
    expect(w.current.birthday).toBe("2026-12-20");
  });

  it("an early reward pulls next year's window into December: birthday Jan 2, today Dec 28", () => {
    const w = windowFor({ month: 1, day: 2 }, [around(7, 0)], d("2026-12-28"));
    expect(w).toMatchObject({
      inWindow: true,
      dayNumber: -5,
      daysUntilBirthday: 5,
    });
    expect(w.current.birthday).toBe("2027-01-02");
  });

  it("Feb 29: day 0 is Feb 28 in 2027 and Feb 29 in 2028", () => {
    const feb29 = { month: 2, day: 29 };
    expect(windowFor(feb29, [fromBirthday(1)], d("2027-02-28"))).toMatchObject({
      dayNumber: 0,
    });
    expect(windowFor(feb29, [fromBirthday(1)], d("2028-02-29"))).toMatchObject({
      dayNumber: 0,
    });
    // The day before, the 2028 window hasn't opened yet: one day to go, outside the window.
    expect(windowFor(feb29, [fromBirthday(1)], d("2028-02-28"))).toMatchObject({
      inWindow: false,
      daysUntilBirthday: 1,
    });
  });

  it("with no rewards enrolled the window is still day 0 to day 30", () => {
    const w = windowFor(JUN15, [], d("2026-06-20"));
    expect(w.current).toMatchObject({ start: "2026-06-15", end: "2026-07-15" });
  });
});

describe("cycleFor (FR-19)", () => {
  it("a Jan 5 pickup with a Dec 20 birthday belongs to the cycle that began before Dec 20", () => {
    const c = cycleFor(d("2027-01-05"), { month: 12, day: 20 }, [
      fromBirthday(7),
    ]);
    expect(c).toMatchObject({ year: 2026, birthday: "2026-12-20" });
  });

  it("a cycle runs from 31 days before the birthday to the day before the next one (decision 0008)", () => {
    const t = [fromBirthday(7)];
    expect(cycleFor(d("2026-06-15"), JUN15, t)).toMatchObject({
      year: 2026,
      cycleStart: "2026-05-15",
      cycleEnd: "2027-05-14",
    });
    expect(cycleFor(d("2027-05-14"), JUN15, t)).toMatchObject({ year: 2026 });
    expect(cycleFor(d("2027-05-15"), JUN15, t)).toMatchObject({ year: 2027 });
  });

  it("a pickup's cycle doesn't change when enrollments change", () => {
    // Birthday Jan 1 with a 30-day-early reward: a Dec 5 pickup is in the 2027 cycle,
    // and stays there after unenrolling (the reviewer's case).
    const jan1 = { month: 1, day: 1 };
    expect(cycleFor(d("2026-12-05"), jan1, [around(30, 0)]).year).toBe(2027);
    expect(cycleFor(d("2026-12-05"), jan1, []).year).toBe(2027);
    const w = windowFor(jan1, [fromBirthday(31)], d("2027-01-10"));
    expect(rewardStatus(fromBirthday(31), w, [d("2026-12-05")])).toBe(
      "picked_up",
    );
  });
});

describe("rewardStatus (FR-11)", () => {
  const status = (t: Timing, on: string, pickups: string[] = [], b = JUN15) =>
    rewardStatus(t, windowFor(b, [t], d(on)), pickups.map(d));

  it("from_birthday 1 is the birthday only; 7 is days 0–6", () => {
    expect(status(fromBirthday(1), "2026-06-15")).toBe("available");
    expect(status(fromBirthday(1), "2026-06-16")).toBe("expired");
    expect(status(fromBirthday(7), "2026-06-21")).toBe("available");
    expect(status(fromBirthday(7), "2026-06-22")).toBe("expired");
  });

  it("birth_month with a birthday on the 25th: available on the 31st, expired the next day", () => {
    const may25 = { month: 5, day: 25 };
    expect(status(BIRTH_MONTH, "2026-05-31", [], may25)).toBe("available");
    expect(status(BIRTH_MONTH, "2026-06-01", [], may25)).toBe("expired");
  });

  it("around 7/3: not open on day −8, available −7…3, expired on day 4", () => {
    expect(status(around(7, 3), "2026-06-07")).toBe("not_open");
    expect(status(around(7, 3), "2026-06-08")).toBe("available");
    expect(status(around(7, 3), "2026-06-18")).toBe("available");
    expect(status(around(7, 3), "2026-06-19")).toBe("expired");
  });

  it("month_start 30 in February: available on Mar 2, expired on Mar 3", () => {
    const feb10 = { month: 2, day: 10 };
    expect(status(monthStart(30), "2027-02-01", [], feb10)).toBe("available");
    expect(status(monthStart(30), "2027-03-02", [], feb10)).toBe("available");
    expect(status(monthStart(30), "2027-03-03", [], feb10)).toBe("expired");
  });

  it("to_month_end with a birthday on the 25th: not open the day before, expired on the 1st", () => {
    const jun25 = { month: 6, day: 25 };
    expect(status(TO_MONTH_END, "2026-06-24", [], jun25)).toBe("not_open");
    expect(status(TO_MONTH_END, "2026-06-30", [], jun25)).toBe("available");
    expect(status(TO_MONTH_END, "2026-07-01", [], jun25)).toBe("expired");
  });

  it("a pickup in this cycle → picked_up; one from last cycle doesn't count", () => {
    expect(status(fromBirthday(7), "2026-06-17", ["2026-06-16"])).toBe(
      "picked_up",
    );
    expect(status(fromBirthday(7), "2026-06-15", ["2025-06-16"])).toBe(
      "available",
    );
  });

  it("after the window nothing is expired: it's next year's and not open yet", () => {
    expect(status(fromBirthday(7), "2026-07-20")).toBe("not_open");
    expect(status(BIRTH_MONTH, "2026-07-20")).toBe("not_open");
  });
});

describe("daysLeft (FR-12)", () => {
  const left = (t: Timing, on: string) =>
    daysLeft(t, windowFor(JUN15, [t], d(on)));

  it("is 1 on the last day and N on the first", () => {
    expect(left(fromBirthday(7), "2026-06-21")).toBe(1);
    expect(left(fromBirthday(7), "2026-06-15")).toBe(7);
  });

  it("gives the values at the urgency band edges (3/4 and 10/11)", () => {
    const t = fromBirthday(14); // closes Jun 28
    expect(left(t, "2026-06-26")).toBe(3);
    expect(left(t, "2026-06-25")).toBe(4);
    expect(left(t, "2026-06-19")).toBe(10);
    expect(left(t, "2026-06-18")).toBe(11);
  });
});

describe("headerState (FR-14)", () => {
  const state = (on: string, anyAvailable: boolean) =>
    headerState(windowFor(JUN15, [fromBirthday(7)], d(on)), anyAvailable);

  it("covers all four states", () => {
    expect(state("2026-06-15", true)).toBe("birthday");
    expect(state("2026-06-20", false)).toBe("birth_month");
    expect(state("2026-06-20", true)).toBe("window_open");
    expect(state("2026-07-02", true)).toBe("window_open");
    expect(state("2026-07-02", false)).toBe("other");
    expect(state("2026-08-01", true)).toBe("other");
  });

  // Owner report 2026-11-26: a December 2 birthday showed "Your birthday's passed" on
  // November 26, because a reward opening a week early put that day in the window.
  const DEC2: Birthday = { month: 12, day: 2 };
  const early: Timing = { type: "around_birthday", before: 7, after: 7 };
  const dec2 = (on: string, anyAvailable: boolean) =>
    headerState(windowFor(DEC2, [early], d(on)), anyAvailable);

  it("never says the birthday passed before it comes", () => {
    expect(dec2("2026-11-26", true)).toBe("other");
    expect(dec2("2026-12-01", true)).toBe("birth_month");
    expect(dec2("2026-12-02", true)).toBe("birthday");
  });

  // The owner's rule: born December 2, on December 3 a reward lasting to the month's end is
  // still open, so the birthday has passed but the rewards haven't, birth month or not.
  it("says the rewards are still open once the birthday has passed", () => {
    const monthEnd: Timing = { type: "to_month_end" };
    expect(
      headerState(windowFor(DEC2, [monthEnd], d("2026-12-03")), true),
    ).toBe("window_open");
    expect(dec2("2026-12-05", true)).toBe("window_open");
    expect(dec2("2026-12-05", false)).toBe("birth_month");
  });
});

describe("pickupDateRange (FR-17) and planRange (FR-23)", () => {
  const w = (on: string) => windowFor(JUN15, [fromBirthday(7)], d(on));

  it("pickups: from the window's start to today inside the window, none outside", () => {
    expect(pickupDateRange(w("2026-06-20"))).toEqual({
      min: "2026-06-15",
      max: "2026-06-20",
    });
    expect(pickupDateRange(w("2026-08-01"))).toBeNull();
  });

  it("plans: today to the end inside the window; the next window outside", () => {
    expect(planRange(w("2026-06-20"))).toEqual({
      min: "2026-06-20",
      max: "2026-07-15",
    });
    expect(planRange(w("2026-08-01"))).toEqual({
      min: "2027-06-15",
      max: "2027-07-15",
    });
  });
});

describe("joinByDate (FR-49)", () => {
  it("counts back from the next birthday, which the window gives", () => {
    // Jun 20, after a Jun 15 birthday: next year's join-by date, not this year's.
    const w = windowFor(JUN15, [fromBirthday(7)], d("2026-06-20"));
    expect(w.nextBirthday).toBe("2027-06-15");
    expect(joinByDate(w.nextBirthday, 7)).toBe("2027-06-08");
  });

  it("is N days before the birthday, across New Year too", () => {
    expect(joinByDate(d("2026-06-15"), 7)).toBe("2026-06-08");
    expect(joinByDate(d("2027-01-03"), 7)).toBe("2026-12-27");
  });
});

describe("formatDate (decision 0007)", () => {
  it("shows the civil date itself, never the day before", () => {
    expect(formatDate(d("2026-06-15"), "short")).toBe("Jun 15");
    expect(formatDate(d("2026-06-15"), "long")).toBe("Monday, June 15");
    expect(formatDate(d("2027-01-01"), "short")).toBe("Jan 1");
    expect(formatDate(d("2028-02-29"), "long")).toBe("Tuesday, February 29");
  });
});

describe("isWithinMinutes (S-101's finish card)", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("is true up to the limit, false after it or in the future", () => {
    expect(isWithinMinutes("2026-11-25T11:50:00Z", 15, now)).toBe(true);
    expect(isWithinMinutes("2026-11-25T11:45:00Z", 15, now)).toBe(true);
    expect(isWithinMinutes("2026-11-25T11:44:59Z", 15, now)).toBe(false);
    expect(isWithinMinutes("2026-11-25T12:00:01Z", 15, now)).toBe(false);
  });
});

describe("the next birthday right after a birthday (S-101 finish, S-103 line)", () => {
  it("is next year's, even while the planning cycle is still this year's", () => {
    // Jun 15 birthday, today Jun 20: the window is still open, the next birthday isn't Jun 15.
    const w = windowFor({ month: 6, day: 15 }, [], d("2026-06-20"));
    expect(w.planning.birthday).toBe("2026-06-15");
    expect(w.nextBirthday).toBe("2027-06-15");
  });
});
