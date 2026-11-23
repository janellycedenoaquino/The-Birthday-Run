import { z } from "zod";
import { isValidMonthDay } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";

// Profile schemas (BUILD §0.5, F-2: FR-6, FR-9, FR-10, D4). Calendar rules live in the timing
// module (NFR-5); this file only shapes form input.

/** FR-6: a real month and day, Feb 29 allowed. Errors land on `day` (BR-18). */
// A missing or non-number month or day (an unpicked select sends nothing) is BR-18 too, never
// Zod's own English (rule 12).
const datePart = z.coerce
  .number({ error: msg("BR-18") })
  .int({ error: msg("BR-18") });

export const birthdaySchema = z
  .object({ month: datePart, day: datePart })
  .strict()
  .refine((v) => isValidMonthDay(v.month, v.day), {
    message: msg("BR-18"),
    path: ["day"],
  });

/**
 * D4: an IANA zone this runtime recognizes, stored as the runtime's own name for it. Browsers
 * report current names (Asia/Kolkata, Europe/Kyiv) while Node's ICU may list older aliases
 * (Asia/Calcutta, Europe/Kiev), so aliases are accepted and normalized, not refused (decision 0009).
 */
// An IANA name: Area/Location or UTC. Not an offset (+05:30) or abbreviation (EST), which Intl
// also accepts. The same pattern is the profiles.time_zone check (DESIGN §3).
const IANA_NAME = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/;

export const timeZoneSchema = z
  .string({ error: msg("BR-19") })
  .max(64, msg("BR-19"))
  .regex(IANA_NAME, msg("BR-19"))
  .transform((tz, ctx) => {
    try {
      const resolved = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
      }).resolvedOptions().timeZone;
      if (IANA_NAME.test(resolved)) return resolved;
    } catch {
      // not a zone this runtime knows
    }
    ctx.addIssue({ code: "custom", message: msg("BR-19") });
    return z.NEVER;
  });

/** S-101 step 1 (F-2 `saveOnboarding`). Step 2 (programs) comes with Phase 2 (ROADMAP). */
export const onboardingBirthdaySchema = z
  .object({
    step: z.literal("birthday"),
    month: datePart,
    day: datePart,
    timeZone: timeZoneSchema,
  })
  .strict()
  .refine((v) => isValidMonthDay(v.month, v.day), {
    message: msg("BR-18"),
    path: ["day"],
  });

export const timeZoneInputSchema = z
  .object({ timeZone: timeZoneSchema })
  .strict();
