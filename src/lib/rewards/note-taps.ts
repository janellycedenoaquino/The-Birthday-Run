// C-109's "How did it go?" taps (decision 0023): they live in the note's first line, so they're
// saved in FR-17's one note field, count toward its limit and show in History as typed. Pure.
import { msg } from "@/lib/messages";

/** "How did it go?" taps (decision 0023), in this order. */
export const TAPS = ["M-312a", "M-312b", "M-312c", "M-312d", "M-312e"] as const;
const SEP = " · ";

/** The taps on the note's first line, or none if that line isn't only taps. */
export function tapsIn(text: string): string[] {
  const first = text.split("\n")[0] ?? "";
  const words = first.split(SEP);
  const labels: string[] = TAPS.map((t) => msg(t));
  return first && words.every((w) => labels.includes(w)) ? words : [];
}

/** Puts the picked taps on the first line, in TAPS order, above what the person typed. */
export function withTaps(text: string, picked: string[]): string {
  const rest = tapsIn(text).length
    ? text.split("\n").slice(1).join("\n")
    : text;
  const line = TAPS.map((t) => msg(t))
    .filter((l) => picked.includes(l))
    .join(SEP);
  return [line, rest].filter(Boolean).join("\n");
}
