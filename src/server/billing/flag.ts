import "server-only";
import { env } from "@/server/env";

/** FR-38 (D8): the one switch for payments; off unless PAYMENTS_ENABLED is exactly "true". */
export function paymentsEnabled(): boolean {
  return env.PAYMENTS_ENABLED === "true";
}
