import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import {
  GuardError,
  withRefusals,
  type GuardFailure,
} from "@/server/auth/guards";
import { logError } from "@/server/errors";

// Wraps every signed-in server action (BUILD §0.2, F-2). Guards run in refuse mode, so a failure
// becomes the action's §0.2 refusal instead of a redirect the form can't show; Next's own
// redirect/notFound errors pass through; anything else is logged and becomes M-7 (NFR-9).
// Its own module (not src/server/errors.ts, which the proxy imports), so the proxy bundle
// doesn't pull in the guards and the Supabase client.

const REFUSALS: Record<Exclude<GuardFailure, "reauth_required">, string> = {
  signed_out: "API-1",
  mfa_required: "API-2",
  password_required: "API-3",
};

export async function runAction<T>(
  op: string,
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await withRefusals(fn);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof GuardError) {
      // The re-auth target is a constant, never input (§0.2).
      if (error.code === "reauth_required")
        redirect("/auth/reauthenticate?next=/settings");
      return { ok: false, error: REFUSALS[error.code] };
    }
    logError(error, { op });
    return { ok: false, error: "M-7" };
  }
}
