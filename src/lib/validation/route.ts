import { z } from "zod";
import { msg } from "@/lib/messages";
import { retailerIdsSchema } from "@/lib/validation/retailers";

// Start location and route inputs (BUILD §0.5, F-10; D10, A-11).

/** A-11: three decimals (about 110 m), in the browser and again on the server. */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

export const startLocationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("coords"),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .strict(),
  z
    .object({
      kind: z.literal("zip"),
      zip: z
        .string()
        .trim()
        .regex(/^\d{5}$/, msg("BR-12")),
    })
    .strict(),
]);
export type StartLocation = z.infer<typeof startLocationSchema>;

export const lookupZipSchema = z
  .object({ start: startLocationSchema })
  .strict();
export const findStopsSchema = z
  .object({ start: startLocationSchema, retailerIds: retailerIdsSchema })
  .strict();
export const groupRouteSchema = z
  .object({ start: startLocationSchema, groupId: z.uuid() })
  .strict();
