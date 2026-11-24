import { z } from "zod";

// Retailer IDs (BUILD §0.5): the slug format of DESIGN §3 retailers.id.
export const retailerIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Catalogue size with headroom; the one home of this bound (BUILD §0.5). */
export const retailerIdsSchema = z.array(retailerIdSchema).min(1).max(250);

export const retailerIdInputSchema = z
  .object({ retailerId: retailerIdSchema })
  .strict();

/** FR-48: the four report reasons, as the report_reason enum (no free text, NFR-11). */
export const reportReasonSchema = z.enum([
  "expired",
  "different_reward",
  "wrong_timing",
  "store_closed",
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportRewardSchema = z
  .object({ retailerId: retailerIdSchema, reason: reportReasonSchema })
  .strict();
