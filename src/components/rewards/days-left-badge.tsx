import { AlertCircle, CircleCheck, Clock } from "lucide-react";
import { msg } from "@/lib/messages";

// C-103 Days-left badge (SPEC §3.3: FR-12, NFR-6, FR-49). Text first, then an urgency word and an
// icon, so colour is never the only cue. The icon is hidden from screen readers.

export type Urgency = "soon" | "coming" | "plenty";

/** FR-12's bands: under 4 days red, 4–10 yellow, over 10 green. */
export function urgencyOf(daysLeft: number): Urgency {
  return daysLeft < 4 ? "soon" : daysLeft <= 10 ? "coming" : "plenty";
}

/**
 * M-120 / M-122. `daysLeft` counts today (timing.daysLeft: 1 = the last day), so the last day
 * reads "Last day" and every other day "{n} days left"; M-121 ("1 day left") never applies here.
 */
export function daysLeftText(daysLeft: number): string {
  return daysLeft <= 1
    ? msg("M-120")
    : msg("M-122").replace("{days}", String(daysLeft));
}

const STYLES = {
  soon: {
    Icon: AlertCircle,
    word: "M-123",
    className:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  },
  coming: {
    Icon: Clock,
    word: "M-124",
    className:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  },
  plenty: {
    Icon: CircleCheck,
    word: "M-125",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  },
} as const;

export function DaysLeftBadge({ daysLeft }: { daysLeft: number }) {
  const { Icon, word, className } = STYLES[urgencyOf(daysLeft)];
  return (
    <div className="grid gap-1">
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium ${className}`}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span>
          {daysLeftText(daysLeft)}
          <span className="sr-only">, </span>
          <span className="font-normal"> · {msg(word)}</span>
        </span>
      </span>
      {daysLeft <= 1 ? (
        <span className="text-xs text-muted-foreground">{msg("M-276")}</span>
      ) : null}
    </div>
  );
}
