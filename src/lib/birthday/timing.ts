// The timing module (BUILD F-2, D4, NFR-5): the only place that knows calendars, windows,
// cycles and reward statuses. Pure and isomorphic, with no imports, so pages, server actions,
// the reminder job and tests all get the same answers (the old client and server disagreed).
//
// Dates are civil dates ("2026-06-15"), never instants. Arithmetic turns them into whole day
// numbers counted from 1970-01-01 at UTC midnight, so daylight saving can never move a day.

/** A civil date, `YYYY-MM-DD`, like Postgres `date`. */
export type LocalDate = string & { readonly __brand: "LocalDate" };

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` → days since 1970-01-01. */
function toDayNumber(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Days since 1970-01-01 → `YYYY-MM-DD`. */
function fromDayNumber(day: number): LocalDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10) as LocalDate;
}

/** Days in a month of a leap year, so Feb 29 is a valid birthday (FR-6). */
const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidMonthDay(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= MAX_DAY[month - 1]!
  );
}

export function addDays(date: LocalDate, n: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** The same day `n` calendar months earlier, clamped to that month's last day (FR-47, A-10). */
export function monthsBefore(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) - n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}` as LocalDate;
}

/** `a − b` in days: negative if `a` is earlier, 0 if the same day. */
export function compareDates(a: LocalDate, b: LocalDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

// ---- Instants from Stripe (F-8) ----------------------------------------------------------------

/** A Unix time in seconds (Stripe's timestamps) as an ISO instant for timestamptz columns. */
export function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** True when the stored instant is at most `minutes` before `now` (S-101's finish card). */
export function isWithinMinutes(
  instant: string,
  minutes: number,
  now: Date,
): boolean {
  const age = now.getTime() - new Date(instant).getTime();
  return age >= 0 && age <= minutes * 60_000;
}

/** The ISO instant `days` × 24 h before `now` (A-20's retention cutoff). */
export function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** The local date in `timeZone` of a stored instant (S-110's renew/end date). */
export function localDateOf(instant: string, timeZone: string): LocalDate {
  return today(timeZone, new Date(instant));
}

/** The date and time on a wall clock in `timeZone` at the instant `now`. */
function wallClock(timeZone: string, now: Date) {
  // formatToParts gives named pieces, so no locale-specific string parsing (MDN).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}` as LocalDate,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Today's date for a user in `timeZone` (FR-10: the profile's zone, so server and device agree). */
export function today(timeZone: string, now: Date): LocalDate {
  return wallClock(timeZone, now).date;
}

/** The time of day, `HH:MM` (24-hour), in `timeZone`. */
export function localTime(timeZone: string, now: Date): string {
  return wallClock(timeZone, now).time;
}

// ---- Birthdays and reward days (FR-10, FR-11) ------------------------------------------------

export type Birthday = { month: number; day: number };

/** FR-11's five timing types (decision 0007). */
export type Timing =
  | { type: "from_birthday"; days: number } // days 0 … N−1
  | { type: "birth_month" } // 1st … last day of the birth month
  | { type: "around_birthday"; before: number; after: number } // day −before … day after
  | { type: "month_start"; days: number } // 1st of the birth month … N days (can pass month end)
  | { type: "to_month_end" }; // birthday … last day of the birth month

export type RewardStatus = "not_open" | "available" | "expired" | "picked_up";

/** One cycle's window: its birthday, first and last day. */
export type Occurrence = {
  birthday: LocalDate;
  start: LocalDate;
  end: LocalDate;
};
/** A cycle (SPEC Terms, decision 0008): fixed bounds, so a pickup's cycle never changes. */
type Cycle = Occurrence & { cycleStart: LocalDate; cycleEnd: LocalDate };

export type BirthdayWindow = {
  today: LocalDate;
  current: Cycle; // the cycle holding today
  planning: Cycle; // current while today <= current.end, else the next one
  inWindow: boolean; // current.start <= today <= current.end
  dayNumber: number; // today − planning.birthday: negative before it, 0 on it
  nextBirthday: LocalDate; // the birthday on or after today (FR-49's join-by date counts back from it)
  daysUntilBirthday: number; // nextBirthday − today; 0 on the birthday
};

/** SPEC Terms: the window never ends before day 30. */
const MIN_WINDOW_DAYS = 30;
/** Decision 0008: every cycle starts this many days before its birthday, the most any reward
 *  can open early (FR-1: 31 days in total), so no window ever starts before its cycle does. */
const CYCLE_LEAD_DAYS = 31;

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const yearOf = (date: LocalDate) => Number(date.slice(0, 4));

function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeap(year) ? 29 : 28) : MAX_DAY[month - 1]!;
}

function firstOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01` as LocalDate;
}

function lastOfMonth(date: LocalDate): LocalDate {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return `${date.slice(0, 7)}-${pad(daysInMonth(y, m))}` as LocalDate;
}

/** The birthday in `year`. Feb 29 is Feb 28 in years without one (FR-10). */
export function birthdayIn(year: number, b: Birthday): LocalDate {
  const day = Math.min(b.day, daysInMonth(year, b.month));
  return `${year}-${pad(b.month)}-${pad(day)}` as LocalDate;
}

/** FR-1 / A-1: a reward lasts 1–31 days in total. */
const MAX_REWARD_DAYS = 31;
const isCount = (n: number | null, min: number): n is number =>
  n !== null && Number.isInteger(n) && n >= min && n <= MAX_REWARD_DAYS;

/** A `retailers` row's three timing columns → a Timing. Throws on any row the DB check refuses. */
export function timingOf(row: {
  timing_type: string;
  days_before: number | null;
  days_after: number | null;
}): Timing {
  const { timing_type: type, days_before: before, days_after: after } = row;
  if (
    (type === "birth_month" || type === "to_month_end") &&
    before === null &&
    after === null
  )
    return { type };
  if (
    (type === "from_birthday" || type === "month_start") &&
    before === null &&
    isCount(after, 1)
  )
    return { type, days: after };
  if (
    type === "around_birthday" &&
    isCount(before, 1) &&
    isCount(after, 0) &&
    before + after + 1 <= MAX_REWARD_DAYS
  )
    return { type, before, after };
  throw new Error(`timingOf: invalid timing ${JSON.stringify(row)}`);
}

/** The first and last day a reward can be used, for the birthday `occurrence` (FR-11). */
export function rewardDays(
  t: Timing,
  occurrence: LocalDate,
): { opens: LocalDate; closes: LocalDate } {
  switch (t.type) {
    case "from_birthday":
      return { opens: occurrence, closes: addDays(occurrence, t.days - 1) };
    case "birth_month":
      return {
        opens: firstOfMonth(occurrence),
        closes: lastOfMonth(occurrence),
      };
    case "around_birthday":
      return {
        opens: addDays(occurrence, -t.before),
        closes: addDays(occurrence, t.after),
      };
    case "month_start": {
      const opens = firstOfMonth(occurrence);
      return { opens, closes: addDays(opens, t.days - 1) };
    }
    case "to_month_end":
      return { opens: occurrence, closes: lastOfMonth(occurrence) };
  }
}

// ---- Windows and cycles (FR-10, FR-19) -------------------------------------------------------

const within = (date: LocalDate, min: LocalDate, max: LocalDate) =>
  compareDates(date, min) >= 0 && compareDates(date, max) <= 0;
const earliest = (dates: LocalDate[]) =>
  dates.reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
const latest = (dates: LocalDate[]) =>
  dates.reduce((a, b) => (compareDates(a, b) >= 0 ? a : b));

/** The window around the birthday in `year`: from the earliest reward opening to the last closing. */
function occurrenceIn(
  year: number,
  b: Birthday,
  timings: Timing[],
): Occurrence {
  const birthday = birthdayIn(year, b);
  const days = timings.map((t) => rewardDays(t, birthday));
  return {
    birthday,
    start: earliest([birthday, ...days.map((x) => x.opens)]),
    end: latest([
      addDays(birthday, MIN_WINDOW_DAYS),
      ...days.map((x) => x.closes),
    ]),
  };
}

/** The cycle for `year`: from 31 days before its birthday to the day before the next one's start. */
function cycleIn(year: number, b: Birthday, timings: Timing[]): Cycle {
  const occ = occurrenceIn(year, b, timings);
  return {
    ...occ,
    cycleStart: addDays(occ.birthday, -CYCLE_LEAD_DAYS),
    cycleEnd: addDays(birthdayIn(year + 1, b), -CYCLE_LEAD_DAYS - 1),
  };
}

/** The year of the cycle holding `date`. Bounds don't depend on enrollments (decision 0008). */
function cycleYear(date: LocalDate, b: Birthday): number {
  const y = yearOf(date);
  // A cycle starts 31 days before its birthday, so it's next year's (late December, early
  // January birthday), this year's, or last year's.
  for (const year of [y + 1, y])
    if (compareDates(addDays(birthdayIn(year, b), -CYCLE_LEAD_DAYS), date) <= 0)
      return year;
  return y - 1;
}

export function windowFor(
  b: Birthday,
  enrolledTimings: Timing[],
  today: LocalDate,
): BirthdayWindow {
  const year = cycleYear(today, b);
  const current = cycleIn(year, b, enrolledTimings);
  const inWindow = within(today, current.start, current.end);
  const planning =
    compareDates(today, current.end) <= 0
      ? current
      : cycleIn(year + 1, b, enrolledTimings);
  const nextBirthday =
    compareDates(today, current.birthday) <= 0
      ? current.birthday
      : birthdayIn(year + 1, b);
  return {
    today,
    current,
    planning,
    inWindow,
    dayNumber: compareDates(today, planning.birthday),
    nextBirthday,
    daysUntilBirthday: compareDates(nextBirthday, today),
  };
}

/** The cycle a date belongs to (SPEC Terms), and the year of its birthday (FR-19's heading). */
export function cycleFor(
  date: LocalDate,
  b: Birthday,
  enrolledTimings: Timing[],
): Cycle & { year: number } {
  const year = cycleYear(date, b);
  return { ...cycleIn(year, b, enrolledTimings), year };
}

// ---- Statuses and ranges (FR-11, FR-12, FR-14, FR-17, FR-23) ----------------------------------

/** Uses the planning cycle, so after the window everything is next year's and not open yet. */
export function rewardStatus(
  t: Timing,
  w: BirthdayWindow,
  pickupDates: LocalDate[],
): RewardStatus {
  const { planning, today } = w;
  if (
    pickupDates.some((p) => within(p, planning.cycleStart, planning.cycleEnd))
  )
    return "picked_up";
  const { opens, closes } = rewardDays(t, planning.birthday);
  if (compareDates(today, opens) < 0) return "not_open";
  if (compareDates(today, closes) > 0) return "expired";
  return "available";
}

/** Days left including today: 1 on the last day. */
export function daysLeft(t: Timing, w: BirthdayWindow): number {
  return compareDates(rewardDays(t, w.planning.birthday).closes, w.today) + 1;
}

export function headerState(
  w: BirthdayWindow,
  anyAvailable: boolean,
): "birthday" | "birth_month" | "window_open" | "other" {
  if (w.today === w.current.birthday) return "birthday";
  if (w.inWindow && w.today.slice(0, 7) === w.current.birthday.slice(0, 7))
    return "birth_month";
  if (w.inWindow && anyAvailable) return "window_open";
  return "other";
}

/** FR-17: a pickup can be dated from the window's start to today, and only inside the window. */
export function pickupDateRange(
  w: BirthdayWindow,
): { min: LocalDate; max: LocalDate } | null {
  return w.inWindow ? { min: w.current.start, max: w.today } : null;
}

/** FR-23: plans run from today to the window's end, or over the next window when outside one. */
export function planRange(w: BirthdayWindow): {
  min: LocalDate;
  max: LocalDate;
} {
  return w.inWindow
    ? { min: w.today, max: w.current.end }
    : { min: w.planning.start, max: w.planning.end };
}

/** FR-49: the last day to join a program with a sign-up lead time of `leadDays`. */
export function joinByDate(birthday: LocalDate, leadDays: number): LocalDate {
  return addDays(birthday, -leadDays);
}

// ---- Display (decision 0007) -----------------------------------------------------------------

const FORMATS = {
  short: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }),
  long: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }),
};

/**
 * "Jun 15" / "Monday, June 15". The date is built at UTC midnight and formatted in UTC, so it
 * shows the same day everywhere; `new Date("2026-06-15")` read in a US zone shows June 14.
 */
export function formatDate(date: LocalDate, style: "short" | "long"): string {
  return FORMATS[style].format(new Date(toDayNumber(date) * MS_PER_DAY));
}
