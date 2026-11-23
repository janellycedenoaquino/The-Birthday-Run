import { z } from "zod";
import { msg } from "@/lib/messages";
import { retailerIdSchema } from "@/lib/validation/retailers";

// Pickup schemas (BUILD §0.5, F-5: FR-17, FR-20). FR-17's limit has its home here and in the
// pickups migration's checks (DESIGN §3).
export const PICKUP_TEXT_MAX = 500;

/** Plain text, trimmed; an empty field is "not given". Counted in code points like Postgres. */
const shortText = z
  .string()
  .trim()
  .refine(
    (s) => [...s].length <= PICKUP_TEXT_MAX,
    msg("M-117").replace("{limit}", String(PICKUP_TEXT_MAX)),
  )
  .transform((s) => (s === "" ? undefined : s))
  .optional();

const localDate = z.iso.date();

export const createPickupSchema = z
  .object({
    retailerId: retailerIdSchema,
    pickedUpOn: z
      .string()
      .transform((s) => (s === "" ? undefined : s))
      .pipe(localDate.optional())
      .optional(),
    note: shortText,
    locationLabel: shortText,
  })
  .strict();

export const updatePickupSchema = z
  .object({ pickupId: z.uuid(), note: shortText, locationLabel: shortText })
  .strict();

export const deletePickupSchema = z
  .object({ pickupId: z.uuid(), intent: z.enum(["undo", "delete"]) })
  .strict();
