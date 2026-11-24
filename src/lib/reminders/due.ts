// Which reminder emails are due for one user today (BUILD F-12 flow 3–5: FR-41, A-9, D14).
// Pure: every date answer comes from the timing module (NFR-5); the job passes the data.
import {
  addDays,
  compareDates,
  daysLeft,
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
};

export type ReminderItem = {
  retailerId: string;
  name: string;
  description: string;
  lastDay: LocalDate;
  daysLeft: number;
};

export type DueReminder = {
  kind: "plan_ahead" | "expiring";
  cycleStart: LocalDate;
  /** The birthday this cycle is for (E-101 names it). */
  birthday: LocalDate;
  items: ReminderItem[];
};

/** E-101 goes out on any of these days before the birthday, once per cycle (D14). */
export const PLAN_AHEAD_DAYS = { from: 1, to: 7 } as const;
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
    return {
      status: rewardStatus(t, w, own),
      item: {
        retailerId: r.retailer_id,
        name: r.name,
        description: r.reward_description,
        lastDay: rewardDays(t, w.planning.birthday).closes,
        daysLeft: daysLeft(t, w),
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
  const soon =
    w.daysUntilBirthday >= PLAN_AHEAD_DAYS.from &&
    w.daysUntilBirthday <= PLAN_AHEAD_DAYS.to;
  const open = rows
    .filter((r) => r.status === "available" || r.status === "not_open")
    .map((r) => r.item);
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
