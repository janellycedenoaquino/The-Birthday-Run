import { describe, expect, it } from "vitest";
import { M, msg } from "@/lib/messages";

// BUILD §0.3 / F-2 "Errors and messages" (NFR-9): every user-facing string, keyed by message ID.
// Texts are copied from SPEC §3.4.

describe("message catalogue", () => {
  it("has every ID in SPEC §3.4 (M-1–M-41, API-1–API-7)", () => {
    const expected = [
      ...Array.from({ length: 41 }, (_, i) => `M-${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `API-${i + 1}`),
    ];
    expect(Object.keys(M).sort()).toEqual(expected.sort());
  });

  it("holds the SPEC §3.4 wording", () => {
    expect(msg("M-4")).toBe(
      "Wrong email or password. Try again, or reset your password.",
    );
    expect(msg("M-7")).toBe("Something went wrong. Please try again.");
    expect(msg("API-4")).toBe("Please check the fields below.");
    expect(msg("M-32")).toBe("Use at least 12 characters.");
  });

  it("keeps the {email} placeholder for the form to fill in", () => {
    expect(msg("M-2")).toContain("{email}");
  });
});
