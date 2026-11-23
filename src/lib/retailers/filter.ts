// Discover's filters (BUILD F-3, §0.8): one pure function, used by S-103 on the server and by
// S-101's program list in the browser. Dates come from the timing module (NFR-5).
import {
  birthdayIn,
  compareDates,
  rewardDays,
  timingOf,
  type Birthday,
  type LocalDate,
} from "@/lib/birthday/timing";

export type FilterRow = {
  id: string;
  name: string;
  category: string;
  timing_type: string;
  days_before: number | null;
  days_after: number | null;
  states_scope: string;
  state_codes: string[];
};

export type Filters = {
  q?: string;
  category?: string;
  length?: "day" | "week" | "longer"; // FR-45, premium
  early?: boolean; // FR-45, premium
  state?: string; // FR-5, premium
};

/** Accent- and case-insensitive form for name search (FR-3: "Häagen" finds "haagen"). */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Exclusive buckets (FR-45): 1 day, 2–7 days, or 8+ days and the whole birth month. */
function bucketOf(
  row: FilterRow,
  days: { opens: LocalDate; closes: LocalDate },
) {
  if (row.timing_type === "birth_month") return "longer";
  const length = compareDates(days.closes, days.opens) + 1;
  return length === 1 ? "day" : length <= 7 ? "week" : "longer";
}

export function filterRetailers<T extends FilterRow>(
  rows: T[],
  filters: Filters,
  ctx: { birthday?: Birthday },
): { shown: T[]; total: number; hiddenByState: number } {
  const q = filters.q ? fold(filters.q.trim()) : "";
  // Length and "early" need the user's birthday (the birth month's length, its 1st); a
  // reference year is enough: only the month and day matter for these lengths.
  const birthday = ctx.birthday
    ? birthdayIn(new Date().getUTCFullYear(), ctx.birthday)
    : null;
  let hiddenByState = 0;

  const shown = rows.filter((row) => {
    if (filters.state) {
      const inState =
        row.states_scope !== "listed" ||
        row.state_codes.includes(filters.state);
      if (!inState) {
        hiddenByState++;
        return false;
      }
    }
    if (q && !fold(row.name).includes(q)) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (birthday && (filters.length || filters.early)) {
      const days = rewardDays(timingOf(row), birthday);
      if (filters.length && bucketOf(row, days) !== filters.length)
        return false;
      if (filters.early && compareDates(days.opens, birthday) >= 0)
        return false;
    }
    return true;
  });
  return { shown, total: rows.length, hiddenByState };
}
