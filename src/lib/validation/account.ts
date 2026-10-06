import { z } from "zod";
import { msg } from "@/lib/messages";

// Account schemas (BUILD §0.5). The length limit is the profiles.display_name check (DESIGN §3),
// counted in code points ([...s].length) like Postgres's char_length.
const DISPLAY_NAME_MAX = 80;

export const displayNameSchema = z
  .string()
  .trim()
  .refine((s) => [...s].length >= 1, msg("M-35"))
  .refine((s) => [...s].length <= DISPLAY_NAME_MAX, msg("M-36"))
  .refine((s) => !/\p{Cc}/u.test(s), msg("M-37"));
