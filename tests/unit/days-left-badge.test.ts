import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DaysLeftBadge,
  daysLeftText,
  urgencyOf,
} from "@/components/rewards/days-left-badge";

// C-103 (FR-12, NFR-6): text and a word per band, never colour alone.
describe("C-103 days-left badge", () => {
  it.each([
    [1, "soon"],
    [3, "soon"],
    [4, "coming"],
    [10, "coming"],
    [11, "plenty"],
    [31, "plenty"],
  ] as const)("%d days → %s (FR-12 bands)", (days, band) => {
    expect(urgencyOf(days)).toBe(band);
  });

  it("the last day reads Last day; others count days", () => {
    expect(daysLeftText(1)).toBe("Last day");
    expect(daysLeftText(2)).toBe("2 days left");
  });

  it.each([
    [1, "Last day", "Ends soon", true],
    [5, "5 days left", "Coming up", false],
    [12, "12 days left", "Plenty of time", false],
  ])(
    "%d: text, word, icon hidden; the brand-clock note only on the last day",
    (days, text, word, note) => {
      const html = renderToStaticMarkup(DaysLeftBadge({ daysLeft: days }));
      expect(html).toContain(text);
      expect(html).toContain(word);
      expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(html.includes("Brands may end it early")).toBe(note);
    },
  );
});
