// S-105 My Rewards, worked out from plain data (BUILD F-4: FR-12–FR-16). Pure: the page loads the
// rows and passes "today"; every date rule comes from the timing module (NFR-5).
import {
  daysLeft,
  headerState,
  rewardDays,
  rewardStatus,
  timingOf,
  windowFor,
  type Birthday,
  type BirthdayWindow,
  type LocalDate,
} from "@/lib/birthday/timing";
import { fold } from "@/lib/retailers/filter";

export type EnrolledRetailer = {
  id: string;
  name: string;
  reward_description: string;
  logo_file: string | null;
  timing_type: string;
  days_before: number | null;
  days_after: number | null;
  signup_lead_days: number | null;
};

/** What availability needs from a retailer row. */
export type EnrolledTiming = Pick<
  EnrolledRetailer,
  "id" | "name" | "timing_type" | "days_before" | "days_after"
>;

export type RewardItem = EnrolledRetailer & { daysLeft: number };
/** A reward of this run that hasn't opened yet, with the day it opens (decision 0018). */
export type LaterItem = EnrolledRetailer & { opens: LocalDate };

export type MyRewards = {
  window: BirthdayWindow;
  header: ReturnType<typeof headerState>;
  /** Exactly one of FR-16 (none), FR-15 (outside), the list, or M-212 (done). */
  view: "none" | "outside" | "list" | "done";
  items: RewardItem[]; // this page's slice, after the filters
  matched: number; // after the filters (M-178 `{shown}`)
  available: number; // before the filters (M-178 `{total}`)
  hasMore: boolean;
  /** "Starting later" (decision 0018): this run's rewards not open yet, soonest first. */
  later: LaterItem[];
  /** This run's rewards already picked up (decision 0018's progress ring). */
  pickedUp: number;
  /** This run's rewards that ended without a pickup: still part of the ring's total. */
  expired: number;
  /** Open rewards with 3 days or fewer left (decision 0018's big card), whatever the filters. */
  endingSoon: number;
};

/** "Ending soon" on S-105's big card: 3 days left or fewer (decision 0018). */
export const ENDING_SOON_DAYS = 3;

/** S-105's list size per "Show more" step (BUILD F-4: a build constant). */
export const REWARDS_PAGE_SIZE = 20;

/**
 * The rewards available today (FR-12), most urgent first (FR-13, ties by name): S-105's list and
 * the route's candidates (FR-32) share it.
 */
export function availableRewards<R extends EnrolledTiming>(input: {
  birthday: Birthday;
  today: LocalDate;
  enrolled: R[];
  pickups: { retailerId: string; date: LocalDate }[];
}): {
  window: BirthdayWindow;
  open: (R & { daysLeft: number })[];
  later: (R & { opens: LocalDate })[];
  pickedUp: number;
  expired: number;
} {
  const { birthday, today, enrolled, pickups } = input;
  const timings = enrolled.map(timingOf);
  const w = windowFor(birthday, timings, today);
  const rows = enrolled.map((r, i) => {
    const own = pickups.filter((p) => p.retailerId === r.id).map((p) => p.date);
    return { r, t: timings[i]!, status: rewardStatus(timings[i]!, w, own) };
  });
  const open = rows
    .filter((x) => x.status === "available")
    .map(({ r, t }) => ({ ...r, daysLeft: daysLeft(t, w) }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  const later = rows
    .filter((x) => x.status === "not_open")
    .map(({ r, t }) => ({
      ...r,
      opens: rewardDays(t, w.planning.birthday).opens,
    }))
    .sort(
      (a, b) => a.opens.localeCompare(b.opens) || a.name.localeCompare(b.name),
    );
  const pickedUp = rows.filter((x) => x.status === "picked_up").length;
  const expired = rows.filter((x) => x.status === "expired").length;
  return { window: w, open, later, pickedUp, expired };
}

export function myRewards(input: {
  birthday: Birthday;
  today: LocalDate;
  enrolled: EnrolledRetailer[];
  pickups: { retailerId: string; date: LocalDate }[];
  filters: { q?: string; within?: 1 | 7 | 14; page?: number };
}): MyRewards {
  const { enrolled, filters } = input;
  const { window: w, open, later, pickedUp, expired } = availableRewards(input);

  const q = filters.q ? fold(filters.q) : "";
  const matching = open.filter(
    (x) =>
      (!q || fold(x.name).includes(q)) &&
      (!filters.within || x.daysLeft <= filters.within),
  );
  const page = Math.max(1, filters.page ?? 1);
  const items = matching.slice(0, page * REWARDS_PAGE_SIZE);

  const view =
    enrolled.length === 0
      ? "none"
      : !w.inWindow
        ? "outside"
        : open.length === 0
          ? "done"
          : "list";

  return {
    window: w,
    header: headerState(w, open.length > 0),
    view,
    items: view === "list" ? items : [],
    matched: matching.length,
    available: open.length,
    hasMore: view === "list" && matching.length > items.length,
    later: view === "none" ? [] : later,
    pickedUp,
    expired,
    endingSoon: open.filter((x) => x.daysLeft <= ENDING_SOON_DAYS).length,
  };
}
