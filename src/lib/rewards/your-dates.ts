import {
  daysLeft,
  formatDate,
  rewardDays,
  rewardStatus,
  windowFor,
  type Birthday,
  type LocalDate,
  type Timing,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";

// M-279 (S-104 signed in, decision 0017): the user's own window for one reward, from the timing
// module only (NFR-5). It follows rewardStatus, so it agrees with My Rewards: the planning
// cycle's dates, "Ended" once they've passed in this cycle, and next year's once the cycle moves on.
export type YourDates = {
  opens: LocalDate;
  closes: LocalDate;
  /** "Starts in 12 days", "Starts in 1 day", "12 days left", "Ends today" or "Ended". */
  status: string;
};

export function yourDates(
  t: Timing,
  birthday: Birthday,
  today: LocalDate,
): YourDates {
  const w = windowFor(birthday, [t], today);
  const days = rewardDays(t, w.planning.birthday);
  const state = rewardStatus(t, w, []);
  let status: string;
  if (state === "expired") status = msg("M-279f");
  else if (state === "not_open") {
    // Days until it opens = days left on the day before it opens, minus the window itself.
    const until =
      daysLeft(t, w) - daysLeft(t, windowFor(birthday, [t], days.opens));
    status =
      until === 1
        ? msg("M-279e")
        : msg("M-279c").replace("{days}", String(until));
  } else {
    const left = daysLeft(t, w);
    status =
      left === 1
        ? msg("M-279d")
        : msg("M-279a").replace("{days}", String(left));
  }
  return { ...days, status };
}

/** "Your dates: Jan 3 – Feb 2 · 12 days left" (M-279). */
export function yourDatesLine(d: YourDates): string {
  return msg("M-279")
    .replace("{start}", formatDate(d.opens, "short"))
    .replace("{end}", formatDate(d.closes, "short"))
    .replace("{status}", d.status);
}
