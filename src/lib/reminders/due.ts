// Which reminder emails are due for one user today (BUILD F-12 flow 3–5: FR-41, A-9, D14).
// Pure: every date answer comes from the timing module (NFR-5); the job passes the data.
import {
  addDays,
  compareDates,
  daysLeft,
  joinByDate,
  rewardDays,
  rewardStatus,
  timingOf,
  today as todayIn,
  windowFor,
  type Birthday,
  type LocalDate,
} from "@/lib/birthday/timing";

export type ReminderReward = {
  retailer_id: string;
  name: string;
  reward_description: string;
  timing_type: string;
  days_before: number | null;
  days_after: number | null;
  /** FR-49: days before the birthday a member must have joined; null when none. */
  signup_lead_days?: number | null;
};

export type ReminderItem = {
  retailerId: string;
  name: string;
  description: string;
  lastDay: LocalDate;
  daysLeft: number;
  /** The first day it can be picked up. */
  opens: LocalDate;
  /** FR-49's join-by date, when the brand has a sign-up lead time. */
  joinBy: LocalDate | null;
};

export type DueReminder = {
  kind: "plan_ahead" | "expiring";
  cycleStart: LocalDate;
  /** The birthday this cycle is for (E-101 names it). */
  birthday: LocalDate;
  items: ReminderItem[];
};

/**
 * E-101 (FR-41, owner 2026-11-24): due from a per-user start day until the day before the
 * birthday, once per cycle (D14: a missed run still sends the next day). The start day is the
 * earliest day the user can act on a reward still to get (it opens, or its join-by date, FR-49),
 * minus a buffer, kept between `latest` and `earliest` days before the birthday. With nothing
 * early, it starts `latest` days before. Earliest real case: a birth-month reward for a birthday on
 * the 31st opens 30 days before, and the longest join-by lead is 30 days (catalogue, 2026-11-24).
 */
export const PLAN_AHEAD = { bufferDays: 2, earliest: 32, latest: 7 } as const;
/** FR-41: "expiring" means this many days left or fewer. */
export const EXPIRING_DAYS = 3;
/** A-9: at most one expiring email every this many days. */
export const EXPIRING_GAP_DAYS = 3;

export function remindersDue(input: {
  birthday: Birthday;
  timeZone: string;
  now: Date;
  rewards: ReminderReward[];
  pickups: { retailerId: string; date: LocalDate }[];
  /** The latest expiring email's local send date, if any. */
  lastExpiringOn: LocalDate | null;
  /** The cycle starts a plan-ahead email has already gone out for. */
  planAheadCycles: LocalDate[];
}): { today: LocalDate; due: DueReminder[] } {
  const today = todayIn(input.timeZone, input.now);
  const timings = input.rewards.map((r) => timingOf(r));
  const w = windowFor(input.birthday, timings, today);
  const rows = input.rewards.map((r, i) => {
    const t = timings[i]!;
    const own = input.pickups
      .filter((p) => p.retailerId === r.retailer_id)
      .map((p) => p.date);
    const opens = rewardDays(t, w.planning.birthday).opens;
    const lead = r.signup_lead_days ?? 0;
    const joinBy = lead > 0 ? joinByDate(w.planning.birthday, lead) : opens;
    return {
      firstAction: compareDates(joinBy, opens) < 0 ? joinBy : opens,
      status: rewardStatus(t, w, own),
      item: {
        retailerId: r.retailer_id,
        name: r.name,
        description: r.reward_description,
        lastDay: rewardDays(t, w.planning.birthday).closes,
        daysLeft: daysLeft(t, w),
        opens,
        joinBy: lead > 0 ? joinBy : null,
      },
    };
  });
  const due: DueReminder[] = [];

  // Expiring (E-102): in the window, available, ≤ 3 days left; not within 3 days of the last.
  const ending = rows
    .filter((r) => r.status === "available" && r.item.daysLeft <= EXPIRING_DAYS)
    .map((r) => r.item);
  const gapOk =
    !input.lastExpiringOn ||
    compareDates(input.lastExpiringOn, addDays(today, -EXPIRING_GAP_DAYS)) <= 0;
  if (w.inWindow && ending.length && gapOk)
    due.push({
      kind: "expiring",
      cycleStart: w.current.cycleStart,
      birthday: w.current.birthday,
      items: sortByLastDay(ending),
    });

  // Plan ahead (E-101): 1–7 days before the birthday, once per cycle; every reward still to get.
  const cycleStart = w.planning.cycleStart;
  const bday = w.planning.birthday;
  const todo = rows.filter(
    (r) => r.status === "available" || r.status === "not_open",
  );
  const open = todo.map((r) => r.item);
  const startDay = planAheadStart(
    bday,
    todo.map((r) => r.firstAction),
  );
  // Only before this cycle's birthday: in the window, planning is the current birthday.
  const soon =
    compareDates(today, bday) < 0 && compareDates(today, startDay) >= 0;
  if (soon && open.length && !input.planAheadCycles.includes(cycleStart))
    due.push({
      kind: "plan_ahead",
      cycleStart,
      birthday: w.planning.birthday,
      items: sortByLastDay(open),
    });

  return { today, due };
}

const sortByLastDay = (items: ReminderItem[]) =>
  [...items].sort(
    (a, b) =>
      compareDates(a.lastDay, b.lastDay) || a.name.localeCompare(b.name),
  );

/** The first day E-101 can go out for a birthday (see PLAN_AHEAD). */
export function planAheadStart(
  birthday: LocalDate,
  firstActions: LocalDate[],
): LocalDate {
  const latest = addDays(birthday, -PLAN_AHEAD.latest);
  const earliest = addDays(birthday, -PLAN_AHEAD.earliest);
  const first = firstActions.reduce<LocalDate | null>(
    (a, b) => (a && compareDates(a, b) <= 0 ? a : b),
    null,
  );
  if (!first) return latest;
  const day = addDays(first, -PLAN_AHEAD.bufferDays);
  if (compareDates(day, earliest) < 0) return earliest;
  return compareDates(day, latest) > 0 ? latest : day;
}
