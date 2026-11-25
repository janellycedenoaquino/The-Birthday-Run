import {
  birthdayIn,
  compareDates,
  formatDate,
  rewardDays,
  windowFor,
  type Birthday,
  type LocalDate,
  type Timing,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";

// M-279 (S-104 signed in, decision 0017): the user's own window for one reward, from the timing
// module (NFR-5). The planning cycle's dates; once this cycle's window has closed, next year's.
export type YourDates = {
  opens: LocalDate;
  closes: LocalDate;
  /** "Starts in 12 days", "Starts in 1 day", "12 days left" or "Ends today". */
  status: string;
};

export function yourDates(
  t: Timing,
  birthday: Birthday,
  today: LocalDate,
): YourDates {
  const w = windowFor(birthday, [t], today);
  let days = rewardDays(t, w.planning.birthday);
  if (compareDates(today, days.closes) > 0)
    days = rewardDays(
      t,
      birthdayIn(Number(w.planning.birthday.slice(0, 4)) + 1, birthday),
    );
  const untilOpen = compareDates(days.opens, today);
  // Days left including today, like daysLeft(): 1 on the last day, which reads "Ends today".
  const left = compareDates(days.closes, today) + 1;
  const status =
    untilOpen > 1
      ? msg("M-279c").replace("{days}", String(untilOpen))
      : untilOpen === 1
        ? msg("M-279e")
        : left === 1
          ? msg("M-279d")
          : msg("M-279a").replace("{days}", String(left));
  return { ...days, status };
}

/** "Your dates: Jan 3 – Feb 2 · 12 days left" (M-279). */
export function yourDatesLine(d: YourDates): string {
  return msg("M-279")
    .replace("{start}", formatDate(d.opens, "short"))
    .replace("{end}", formatDate(d.closes, "short"))
    .replace("{status}", d.status);
}
