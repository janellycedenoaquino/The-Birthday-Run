import { describe, expect, it } from "vitest";
import { tapsIn, withTaps } from "@/lib/rewards/note-taps";

// C-109's taps live in the note's first line (decision 0023).
describe("note taps", () => {
  it("puts taps on the first line, in the fixed order, above what was typed", () => {
    expect(withTaps("", ["Needed the app", "Easy"])).toBe(
      "Easy · Needed the app",
    );
    expect(withTaps("Free drink", ["Easy"])).toBe("Easy\nFree drink");
  });

  it("replaces the tap line instead of adding another", () => {
    const once = withTaps("Free drink", ["Easy"]);
    expect(withTaps(once, ["Easy", "Had to ask"])).toBe(
      "Easy · Had to ask\nFree drink",
    );
  });

  it("removes the line when the last tap is undone, keeping the typed text", () => {
    expect(withTaps("Easy\nFree drink", [])).toBe("Free drink");
    expect(withTaps("Easy", [])).toBe("");
  });

  it("reads taps only from a line that is nothing but taps", () => {
    expect(tapsIn("Easy · Needed the app\nok")).toEqual([
      "Easy",
      "Needed the app",
    ]);
    expect(tapsIn("Easy peasy")).toEqual([]);
    expect(tapsIn("Free drink\nEasy")).toEqual([]);
  });

  it("never touches typed text that isn't a tap line", () => {
    expect(withTaps("Free drink, easy", ["Easy"])).toBe(
      "Easy\nFree drink, easy",
    );
  });
});
