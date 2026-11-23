import { z } from "zod";
import { msg } from "@/lib/messages";
import { retailerIdsSchema } from "@/lib/validation/retailers";

// Plan schemas (BUILD F-6, §0.5: FR-23, FR-25, FR-27). The name's length is A-19 (DESIGN §3),
// counted in code points like Postgres; the database checks the same.
const GROUP_NAME_MAX = 80;
/** FR-25's premium cap: the most items any reorder can list. */
const GROUP_ITEMS_MAX = 10;

const groupName = z
  .string()
  .trim()
  .refine((s) => [...s].length >= 1, msg("M-35"))
  .refine((s) => [...s].length <= GROUP_NAME_MAX, msg("M-36"))
  .refine((s) => !/\p{Cc}/u.test(s), msg("M-242"));

export const groupFields = {
  name: groupName,
  pickupDate: z.iso.date(),
  pickupTime: z.iso.time({ precision: -1 }),
};

const groupId = z.uuid();

export const createGroupSchema = z
  .object({ ...groupFields, retailerIds: retailerIdsSchema.optional() })
  .strict();
export const addToGroupSchema = z
  .object({ groupId, retailerIds: retailerIdsSchema })
  .strict();
export const updateGroupSchema = z.object({ groupId, ...groupFields }).strict();
export const removeFromGroupSchema = z
  .object({ groupId, itemId: z.uuid() })
  .strict();
export const reorderSchema = z
  .object({
    groupId,
    itemIds: z.array(z.uuid()).min(1).max(GROUP_ITEMS_MAX),
  })
  .strict();
export const deleteGroupSchema = z.object({ groupId }).strict();
