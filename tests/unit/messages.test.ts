import { describe, expect, it } from "vitest";
import { M, msg } from "@/lib/messages";

// BUILD §0.3 / F-2 "Errors and messages" (NFR-9): every user-facing string, keyed by message ID.
// Texts are copied from SPEC §3.4.

describe("message catalogue", () => {
  it("has every Template ID (M-1–M-41, API-1–API-7) and the app's IDs built so far", () => {
    // App IDs are added with the screen that shows them (BUILD §0.3).
    const app = [
      "M-105",
      "M-106",
      "M-107",
      "M-108",
      "M-256",
      "M-257",
      "M-278",
      "BR-1",
      "BR-18",
      "BR-19",
      "M-101",
      "M-103",
      "M-104",
      "M-109",
      "M-110",
      "M-111",
      "M-111b",
      "M-111c",
      "M-118",
      "M-171",
      "M-171a",
      "M-171b",
      "M-171c",
      "M-178",
      "M-179",
      "M-189a",
      "M-189b",
      "M-189c",
      "M-277",
      "M-277b",
      "BR-3",
      "M-101b",
      "M-120",
      "M-122",
      "M-123",
      "M-124",
      "M-125",
      "M-126",
      "M-127",
      "M-128",
      "M-129a",
      "M-129b",
      "M-201",
      "M-201b",
      "M-202",
      "M-202b",
      "M-203",
      "M-204",
      "M-205",
      "M-206",
      "M-207",
      "M-209",
      "M-211",
      "M-212",
      "M-276",
      "M-101c",
      "M-112",
      "M-113",
      "M-114",
      "M-115",
      "M-116",
      "M-117",
      "M-185",
      "M-186",
      "M-129d",
      "M-250",
      "M-251",
      "M-252",
      "M-253",
      "M-254",
      "M-255",
      "BR-8b",
      "BR-9",
      "BR-10",
      "BR-11",
      "BR-21",
      "BR-22",
    ];
    const expected = [
      ...Array.from({ length: 41 }, (_, i) => `M-${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `API-${i + 1}`),
      ...app,
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
