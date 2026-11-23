import { z } from "zod";
import { isValidMonthDay } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";

// Profile schemas (BUILD §0.5, F-2: FR-6, FR-9, FR-10, D4). Calendar rules live in the timing
// module (NFR-5); this file only shapes form input.

/** FR-6: a real month and day, Feb 29 allowed. Errors land on `day` (BR-18). */
export const birthdaySchema = z
  .object({
    month: z.coerce.number().int(),
    day: z.coerce.number().int(),
  })
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
export const timeZoneSchema = z
  .string()
  .min(1, msg("BR-19"))
  .max(64, msg("BR-19"))
  .transform((tz, ctx) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
      }).resolvedOptions().timeZone;
    } catch {
      ctx.addIssue({ code: "custom", message: msg("BR-19") });
      return z.NEVER;
    }
  });

/** S-101 step 1 (F-2 `saveOnboarding`). Step 2 (programs) comes with Phase 2 (ROADMAP). */
export const onboardingBirthdaySchema = z
  .object({
    step: z.literal("birthday"),
    month: z.coerce.number().int(),
    day: z.coerce.number().int(),
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
