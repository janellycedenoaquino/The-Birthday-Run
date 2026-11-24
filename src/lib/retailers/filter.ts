// Discover's filters (BUILD F-3, §0.8): one pure function, used by S-103 on the server and by
// S-101's program list in the browser. Dates come from the timing module (NFR-5).
import {
  compareDates,
  rewardDays,
  timingOf,
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

/**
 * The form names are compared in (FR-3): no accents, case or punctuation, so "haagen" finds
 * Häagen-Dazs, "chilis" finds Chili's, "elf" finds e.l.f. and "chick fil a" finds Chick-fil-A.
 */
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Exclusive buckets (FR-45): 1 day, 2–7 days, or 8+ days and the whole birth month. */
function bucketOf(
  row: FilterRow,
  days: { opens: LocalDate; closes: LocalDate },
) {
  if (row.timing_type === "birth_month") return "longer";
  const length = compareDates(days.closes, days.opens) + 1;
  return length === 1 ? "day" : length <= 7 ? "week" : "longer";
}

/**
 * `ctx.occurrence` is the birthday the lengths are measured for (the user's planning birthday,
 * `windowFor(...).planning.birthday`): lengths like "to the end of the month" depend on the year.
 * Without it, the length and "early" filters are ignored. Pure: no clock.
 */
export function filterRetailers<T extends FilterRow>(
  rows: T[],
  filters: Filters,
  ctx: { occurrence?: LocalDate },
): { shown: T[]; total: number; hiddenByState: number } {
  const q = filters.q ? fold(filters.q) : "";
  const occurrence = ctx.occurrence ?? null;
  let hiddenByState = 0;

  const shown = rows.filter((row) => {
    if (q && !fold(row.name).includes(q)) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (occurrence && (filters.length || filters.early)) {
      const days = rewardDays(timingOf(row), occurrence);
      if (filters.length && bucketOf(row, days) !== filters.length)
        return false;
      if (filters.early && compareDates(days.opens, occurrence) >= 0)
        return false;
    }
    // Last, so M-172's {hidden} counts only rows the state alone hides (FR-5).
    if (filters.state) {
      if (!inState(row, filters.state)) {
        hiddenByState++;
        return false;
      }
    }
    return true;
  });
  return { shown, total: rows.length, hiddenByState };
}

/** FR-5: shown for a state when marked "all", unknown, or listing that state. */
export function inState(
  row: Pick<FilterRow, "states_scope" | "state_codes">,
  state: string,
): boolean {
  return row.states_scope !== "listed" || row.state_codes.includes(state);
}
