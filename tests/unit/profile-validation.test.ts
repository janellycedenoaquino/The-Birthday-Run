import { describe, expect, it } from "vitest";
import { msg } from "@/lib/messages";
import {
  birthdaySchema,
  onboardingBirthdaySchema,
  timeZoneSchema,
} from "@/lib/validation/profile";

// BUILD §0.5 profile schemas (FR-6, D4).
const dayErrors = (input: unknown) => {
  const r = birthdaySchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("birthdaySchema (FR-6)", () => {
  it("accepts Feb 29 and form strings", () => {
    expect(birthdaySchema.parse({ month: "2", day: "29" })).toEqual({
      month: 2,
      day: 29,
    });
  });

  it.each([
    [2, 30],
    [4, 31],
    [13, 1],
    [0, 5],
  ])("%d/%d → BR-18 on the day field", (month, day) => {
    expect(dayErrors({ month, day })).toEqual([["day", msg("BR-18")]]);
  });

  it("refuses extra fields (a year can't sneak in: NFR-3)", () => {
    expect(
      birthdaySchema.safeParse({ month: 6, day: 15, year: 1990 }).success,
    ).toBe(false);
  });
});

describe("timeZoneSchema (D4)", () => {
  it.each(["America/New_York", "Asia/Kathmandu", "UTC"])("accepts %s", (tz) => {
    expect(timeZoneSchema.safeParse(tz).success).toBe(true);
  });

  it("accepts a new or old name for the same zone and stores one name for both", () => {
    // Browsers say Asia/Kolkata; some ICU builds list only Asia/Calcutta.
    const a = timeZoneSchema.parse("Asia/Kolkata");
    const b = timeZoneSchema.parse("Asia/Calcutta");
    expect(a).toBe(b);
    expect(Intl.supportedValuesOf("timeZone").concat("UTC")).toContain(a);
  });

  it.each(["Mars/Olympus_Mons", "", "x".repeat(65)])(
    "refuses %j with BR-19",
    (tz) => {
      const r = timeZoneSchema.safeParse(tz);
      expect(r.success).toBe(false);
    },
  );
});

describe("onboardingBirthdaySchema (S-101 step 1)", () => {
  it("needs step, month, day and time zone", () => {
    const ok = {
      step: "birthday",
      month: "6",
      day: "15",
      timeZone: "America/Chicago",
    };
    expect(onboardingBirthdaySchema.parse(ok)).toEqual({
      ...ok,
      month: 6,
      day: 15,
    });
    expect(
      onboardingBirthdaySchema.safeParse({ ...ok, step: "programs" }).success,
    ).toBe(false);
    expect(
      onboardingBirthdaySchema.safeParse({ ...ok, timeZone: undefined })
        .success,
    ).toBe(false);
  });
});
