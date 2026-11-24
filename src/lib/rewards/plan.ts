// S-106 Plan's rules from plain data (BUILD F-6: FR-22, FR-23, FR-9). Pure; dates from timing.ts.
import {
  addDays,
  compareDates,
  daysLeft,
  planRange,
  rewardDays,
  rewardStatus,
  timingOf,
  windowFor,
  type Birthday,
  type BirthdayWindow,
  type LocalDate,
} from "@/lib/birthday/timing";

export type PlanRetailer = {
  id: string;
  name: string;
  logo_file: string | null;
  timing_type: string;
  days_before: number | null;
  days_after: number | null;
};

export type PlanRow = PlanRetailer & {
  pickedUp: boolean; // shown with M-225, not selectable
  daysLeft: number | null; // in the window only (C-103)
  closes: LocalDate; // this cycle's last day for the reward (M-227)
};

/**
 * FR-22: in the window, enrolled rewards neither expired nor picked up (picked-up ones listed but
 * not selectable); outside it, every enrolled reward, for the next window.
 */
export function plannable(input: {
  birthday: Birthday;
  today: LocalDate;
  enrolled: PlanRetailer[];
  pickups: { retailerId: string; date: LocalDate }[];
}): { window: BirthdayWindow; rows: PlanRow[]; all: PlanRow[] } {
  const timings = input.enrolled.map(timingOf);
  const w = windowFor(input.birthday, timings, input.today);
  // `all` keeps expired ones too: a group can still hold them (names, M-227); `rows` is the list.
  const all: (PlanRow & { expired: boolean })[] = input.enrolled.map((r, i) => {
    const t = timings[i]!;
    const own = input.pickups
      .filter((p) => p.retailerId === r.id)
      .map((p) => p.date);
    const status = rewardStatus(t, w, own);
    return {
      ...r,
      expired: status === "expired",
      pickedUp: status === "picked_up",
      daysLeft: w.inWindow && status === "available" ? daysLeft(t, w) : null,
      closes: rewardDays(t, w.planning.birthday).closes,
    };
  });
  all.sort((a, b) => a.name.localeCompare(b.name));
  const rows = all.filter((r) => !r.expired);
  return { window: w, rows, all };
}

/**
 * FR-23: a pickup date inside planRange, and not earlier today than now. Returns the range on a
 * bad date (BR-8's {start}/{end}), else null.
 */
export function pickupProblem(
  w: BirthdayWindow,
  date: LocalDate,
  time: string,
  nowTime: string,
): { start: LocalDate; end: LocalDate } | null {
  const range = planRange(w);
  const outside =
    compareDates(date, range.min) < 0 || compareDates(date, range.max) > 0;
  const earlierToday = date === w.today && time < nowTime;
  return outside || earlierToday ? { start: range.min, end: range.max } : null;
}

/** M-227: the chosen rewards that end before the pickup date (a warning; saving is allowed). */
export function endingBefore(rows: PlanRow[], pickupDate: LocalDate): string[] {
  return rows
    .filter((r) => compareDates(r.closes, pickupDate) < 0)
    .map((r) => r.name);
}

/** FR-9: a group whose pickup is outside the window being planned gets M-235. */
export function outsideWindow(
  w: BirthdayWindow,
  pickupDate: LocalDate,
): boolean {
  const range = planRange(w);
  return (
    compareDates(pickupDate, range.min) < 0 ||
    compareDates(pickupDate, range.max) > 0
  );
}

/**
 * The new-group form's starting date and time: the next whole hour today when that's still
 * today, else noon on the next day of the range (FR-23: never in the past, inside the range).
 */
export function defaultPickup(
  w: BirthdayWindow,
  nowTime: string,
): { date: LocalDate; time: string } {
  const range = planRange(w);
  if (range.min !== w.today) return { date: range.min, time: "12:00" };
  const next = Number(nowTime.slice(0, 2)) + 1;
  if (next <= 23)
    return { date: range.min, time: `${String(next).padStart(2, "0")}:00` };
  const tomorrow = addDays(w.today, 1);
  // The window's last day, after 23:00: the last minute of today is the only time left.
  if (compareDates(tomorrow, range.max) > 0)
    return { date: w.today, time: "23:59" };
  return { date: tomorrow, time: "12:00" };
}
