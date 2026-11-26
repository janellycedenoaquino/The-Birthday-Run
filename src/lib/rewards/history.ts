// S-107 History, worked out from plain data (BUILD F-5: FR-19, FR-21). Pure; cycles come from the
// timing module, whose bounds don't depend on enrollments (decision 0008).
import {
  compareDates,
  cycleFor,
  windowFor,
  type Birthday,
  type LocalDate,
  type Timing,
} from "@/lib/birthday/timing";

export type HistoryPickup = {
  id: string;
  retailer: string;
  /** The retailer's reward, shown under its name (decision 0016). */
  reward: string;
  date: LocalDate;
  note: string | null;
  locationLabel: string | null;
};

export type HistorySection = { year: number; items: HistoryPickup[] };

/**
 * One section per cycle ("{year} Birthday Run"), newest first; the planning cycle always shows
 * (empty is fine, M-252). Within a section, newest pickup first. No pickups ever → [] (M-253).
 */
export function historySections(input: {
  birthday: Birthday;
  timings: Timing[];
  today: LocalDate;
  pickups: HistoryPickup[];
}): HistorySection[] {
  const { birthday, timings, today, pickups } = input;
  if (pickups.length === 0) return [];
  const byYear = new Map<number, HistoryPickup[]>();
  for (const p of pickups) {
    const year = cycleFor(p.date, birthday, timings).year;
    byYear.set(year, [...(byYear.get(year) ?? []), p]);
  }
  const planningYear = Number(
    windowFor(birthday, timings, today).planning.birthday.slice(0, 4),
  );
  if (!byYear.has(planningYear)) byYear.set(planningYear, []);
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({
      year,
      // Newest first; same-day pickups in a stable order.
      items: [...items].sort(
        (x, y) => compareDates(y.date, x.date) || x.id.localeCompare(y.id),
      ),
    }));
}

/**
 * S-102's stats (FR-21): pickups in "this Birthday Run" and the latest. "This" is the planning
 * cycle, as on My Rewards and in History's top section: after the window closes, the next one.
 */
export function pickupStats(input: {
  birthday: Birthday;
  timings: Timing[];
  today: LocalDate;
  dates: LocalDate[];
}): { thisCycle: number; last: LocalDate | null } {
  const w = windowFor(input.birthday, input.timings, input.today);
  const { cycleStart, cycleEnd } = w.planning;
  const thisCycle = input.dates.filter(
    (d) => compareDates(d, cycleStart) >= 0 && compareDates(d, cycleEnd) <= 0,
  ).length;
  const last = input.dates.reduce<LocalDate | null>(
    (max, d) => (max === null || compareDates(d, max) > 0 ? d : max),
    null,
  );
  return { thisCycle, last };
}
