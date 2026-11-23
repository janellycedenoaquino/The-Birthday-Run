// Retailer labels shown on C-102 and S-104 (SPEC §3.4: M-170, M-180, M-181–M-184b, M-189a–c).
// Lists live here, keyed by the enum value; single messages are in src/lib/messages.ts.
import type { Timing } from "@/lib/birthday/timing";

/** M-170 (without "All", which is the tab for no category). */
export const CATEGORY_LABELS: Record<string, string> = {
  food_drink: "Food and drink",
  entertainment: "Entertainment",
  retail: "Retail",
  beauty: "Beauty",
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS);

/** M-180: label and explanation per reward type. */
export const REWARD_TYPE_LABELS: Record<
  string,
  { label: string; explanation: string }
> = {
  free_item: {
    label: "Free item",
    explanation: "something free, no purchase needed.",
  },
  discount: { label: "Discount", explanation: "money off your order." },
  bogo: {
    label: "Buy one, get one",
    explanation: "a second item free when you buy one.",
  },
  points: {
    label: "Points",
    explanation: "bonus points added to your account.",
  },
  free_with_purchase: {
    label: "Free with purchase",
    explanation: "free when you buy something else.",
  },
};

/** M-181–M-184b: how long a reward lasts, in words. */
export function timingLabel(t: Timing): string {
  switch (t.type) {
    case "from_birthday":
      return t.days === 1
        ? "Birthday only"
        : `${t.days} days from your birthday`;
    case "birth_month":
      return "All birth month";
    case "around_birthday":
      return t.after === 0
        ? `From ${t.before} days before to your birthday`
        : `From ${t.before} days before to ${t.after} days after your birthday`;
    case "month_start":
      return `${t.days} days from the 1st of your birth month`;
    case "to_month_end":
      return "From your birthday to the end of your birth month";
  }
}

/** The name's initials, for a card without a logo (C-102). */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
