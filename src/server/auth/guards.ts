import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { createClient } from "@/server/supabase/server";

// The server-side access checks (BUILD F-2 "Guards", §0.2; D2, D8, D9, D10, D24.1; CLAUDE.md
// rule 3). Every protected page, action and route handler calls one. They verify with the Auth
// server (getUser), never trust the cookie alone (getSession), and read MFA factors from the
// server's user record. Pages run in redirect mode; actions run in refuse mode via runAction.

export type GuardFailure =
  "signed_out" | "mfa_required" | "password_required" | "reauth_required";

export class GuardError extends Error {
  constructor(readonly code: GuardFailure) {
    super(`guard: ${code}`);
    this.name = "GuardError";
  }
}

// D9: the newest sign-in method must be at most 10 minutes old.
const RECENT_SIGN_IN_MS = 10 * 60_000;
// D24.6: a recovery session counts for 15 minutes.
const RECOVERY_WINDOW_MS = 15 * 60_000;

type Amr = { method?: string; timestamp: number }[] | undefined;
type Claims = { aal?: string; amr?: Amr; [key: string]: unknown };

/** D9: the newest `amr` timestamp (seconds) is within the window. Pure; the clock is injected. */
export function isRecentSignIn(amr: Amr, nowMs: number): boolean {
  if (!amr?.length) return false;
  const newest = Math.max(...amr.map((entry) => entry.timestamp));
  return nowMs - newest * 1000 <= RECENT_SIGN_IN_MS;
}

/**
 * D24.6: the session came from a password-reset link within the window. `amr` "contains" a
 * recovery entry (not "is newest": the MFA step adds a later one, D24.5) - or, since GoTrue
 * records a reset as "otp" (week-1 check 5, decisions/0014), the signed `auth_recovery` marker
 * verified for this user (src/server/auth/recovery.ts). Never an unsigned cookie.
 */
export function isRecoverySession(
  claims: Pick<Claims, "amr">,
  nowMs: number,
  signedMarkerValid = false,
): boolean {
  const recentAmr = (claims.amr ?? []).some(
    (entry) =>
      entry.method === "recovery" &&
      nowMs - entry.timestamp * 1000 <= RECOVERY_WINDOW_MS,
  );
  return recentAmr || signedMarkerValid;
}

// Refuse mode: set by withRefusals (runAction) for server actions, so a failed guard throws
// GuardError for the action to turn into its §0.2 refusal instead of redirecting.
const refuseMode = new AsyncLocalStorage<true>();

export function withRefusals<T>(fn: () => Promise<T>): Promise<T> {
  return refuseMode.run(true, fn);
}

const PAGE_TARGETS: Record<GuardFailure, string> = {
  signed_out: "/sign-in",
  mfa_required: "/auth/mfa",
  password_required: "/auth/set-password",
  reauth_required: "/auth/reauthenticate",
};

/** Throws GuardError in refuse mode; otherwise redirects the page per §0.2. */
async function fail(code: GuardFailure): Promise<never> {
  if (refuseMode.getStore()) throw new GuardError(code);
  // Back to where the user was, after the step: the proxy's x-pathname, checked like any `next`.
  const here = (await headers()).get("x-pathname");
  const next = safeRedirectPath(here, "/dashboard");
  redirect(`${PAGE_TARGETS[code]}?next=${encodeURIComponent(next)}`);
}

const hasVerifiedFactor = (user: User) =>
  (user.factors ?? []).some((factor) => factor.status === "verified");

type GuardOptions = {
  allowPendingMfa?: boolean;
  allowPendingPassword?: boolean;
};

async function checkUser({
  allowPendingMfa = false,
  allowPendingPassword = false,
}: GuardOptions) {
  const supabase = await createClient();

  // 1-2. Verified with the Auth server. No user, an error or an unconfirmed email: signed out.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return fail("signed_out");

  // 3. The verified JWT's claims (aal, amr).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Claims | undefined;
  if (!claims) return fail("signed_out");

  // 4. MFA (D8): factors from the Auth server's user record, never from the cookie.
  if (claims.aal !== "aal2" && hasVerifiedFactor(user) && !allowPendingMfa)
    return fail("mfa_required");

  // 5. Password step (D10, D24.1): an email-only account must have set its password.
  if (!allowPendingMfa && !allowPendingPassword) {
    const emailOnly = (user.identities ?? []).every(
      (identity) => identity.provider === "email",
    );
    if (emailOnly) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("password_set_at")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile)
        // Fails closed: a generic error, never a way past the step. Logged once, by whoever
        // catches it (runAction, or Next's onRequestError for pages); the cause rides along.
        throw new Error("requireUser: could not check the password step", {
          cause: profileError ?? "profile row missing",
        });
      if (!profile.password_set_at) return fail("password_required");
    }
  }

  return { supabase, user, claims };
}

// React cache() keys on argument identity, so it's keyed on the two flags (primitives), not on
// an options object: one Auth round-trip per request per level (§0.2).
const cachedCheck = cache(
  (allowPendingMfa: boolean, allowPendingPassword: boolean) =>
    checkUser({ allowPendingMfa, allowPendingPassword }),
);

/** A verified, confirmed user who passed MFA and the password step (§0.2 levels). */
export function requireUser({
  allowPendingMfa = false,
  allowPendingPassword = false,
}: GuardOptions = {}) {
  return cachedCheck(allowPendingMfa, allowPendingPassword);
}

/** `requireUser()` plus a sign-in within the D9 window; else `reauth_required`. */
export const requireRecentSignIn = cache(async () => {
  const result = await requireUser();
  if (!isRecentSignIn(result.claims.amr, Date.now()))
    return fail("reauth_required");
  return result;
});
