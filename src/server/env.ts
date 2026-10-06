import "server-only";
import { formatEnvError, serverEnvSchema } from "@/lib/env/schema";

// Parsed once per server process (D6). Secrets are read only through this module.
const parsed = serverEnvSchema.safeParse(process.env);
if (!parsed.success) throw new Error(formatEnvError(parsed.error));

export const env = Object.freeze(parsed.data);
