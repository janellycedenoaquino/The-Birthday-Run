import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/server/env";
import { logError } from "@/server/errors";
import { getAdminClient } from "@/server/supabase/admin";

// The rate limiter (BUILD F-2 and §0.4, D3, D24.13): a fixed-window counter per key in Postgres,
// through the service-role-only `rate_limit_hit`. Keys are HMACs, so the table never holds an IP,
// email or user ID. Fails closed. §0.4 is the only place the numbers come from.

type Window = readonly [max: number, windowSeconds: number];
type Limit = { ip?: Window; email?: Window; user?: Window };

const MIN = 60;
const HOUR = 60 * MIN;
const mfaVerify: Limit = { ip: [30, 15 * MIN], user: [5, 5 * MIN] };
const perUserHourly: Limit = { user: [5, HOUR] };

export const LIMITS = {
  signIn: { ip: [20, 10 * MIN], email: [10, 15 * MIN] },
  signUp: { ip: [5, HOUR], email: [3, HOUR] },
  requestMagicLink: { ip: [10, HOUR], email: [3, HOUR] },
  requestPasswordReset: { ip: [10, HOUR], email: [3, HOUR] },
  verifyMfaSignIn: mfaVerify,
  confirmMfaEnrollment: mfaVerify,
  disableMfa: mfaVerify,
  startMfaEnrollment: { user: [10, HOUR] },
  reauthenticateWithPassword: { ip: [20, 10 * MIN], user: [5, 15 * MIN] },
  signInWithGoogle: { ip: [20, 10 * MIN] },
  changePassword: perUserHourly,
  updatePasswordFromReset: perUserHourly,
  setInitialPassword: perUserHourly,
  accountExport: perUserHourly,
  deleteAccount: perUserHourly,
  updateDisplayName: { user: [30, HOUR] },
  authConfirm: { ip: [30, 10 * MIN] },
  authCallback: { ip: [30, 10 * MIN] },
} as const satisfies Record<string, Limit>;

export type RateLimitAction = keyof typeof LIMITS;
type Ids = { email?: string; userId?: string };
type Check = { key: string; max: number; windowSeconds: number };
type Hit = (check: Check) => Promise<boolean>;

const hmac = (value: string, secret: string) =>
  createHmac("sha256", secret).update(value).digest("hex");

/**
 * The keys to check for one call, IP first (§0.4). Throws if the limit needs an email or user ID
 * the caller didn't pass: a programming error, which `rateLimit` turns into a refusal.
 */
export function limitChecks(
  action: RateLimitAction,
  { ip, email, userId }: Ids & { ip: string },
  secret: string,
): Check[] {
  const limit: Limit = LIMITS[action];
  const checks: Check[] = [];
  const add = (kind: string, value: string, [max, windowSeconds]: Window) =>
    checks.push({
      key: `${action}:${kind}:${hmac(value, secret)}`,
      max,
      windowSeconds,
    });
  if (limit.ip) add("ip", ip, limit.ip);
  if (limit.email) {
    // Blank counts as missing: every blank request would otherwise share one bucket.
    if (!email?.trim()) throw new Error(`rateLimit(${action}) needs an email`);
    add("email", email.trim().toLowerCase(), limit.email);
  }
  if (limit.user) {
    if (!userId) throw new Error(`rateLimit(${action}) needs a user ID`);
    add("user", userId, limit.user);
  }
  return checks;
}

/** Runs the checks in order and stops at the first refusal; every call counts. */
export async function runChecks(checks: Check[], hit: Hit): Promise<boolean> {
  for (const check of checks) if (!(await hit(check))) return false;
  return true;
}

/** The first `x-forwarded-for` value (Vercel overwrites the header), else "unknown" (§0.4). */
export function clientIp(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export type RateLimitResult =
  { ok: true } | { ok: false; error: "M-5" | "M-7" };

/**
 * `{ ok: true }` = allowed. Limited → M-5 (the same for every account, NFR-12). Any error (the
 * database, a missing ID) is logged without key contents and refused with M-7 (fails closed).
 * Callers return the error as-is: `if (!limit.ok) return limit` fits ActionResult (§0.2).
 */
export async function rateLimit(
  action: RateLimitAction,
  ids: Ids = {},
): Promise<RateLimitResult> {
  try {
    const ip = clientIp((await headers()).get("x-forwarded-for"));
    const checks = limitChecks(
      action,
      { ...ids, ip },
      env.RATE_LIMIT_HMAC_SECRET,
    );
    const admin = getAdminClient();
    const allowed = await runChecks(
      checks,
      async ({ key, max, windowSeconds }) => {
        const { data, error } = await admin.rpc("rate_limit_hit", {
          p_key: key,
          p_max: max,
          p_window_seconds: windowSeconds,
        });
        if (error) throw new Error(`rate_limit_hit failed: ${error.code}`);
        return data === true; // anything but true counts as limited
      },
    );
    return allowed ? { ok: true } : { ok: false, error: "M-5" };
  } catch (error) {
    // The error never includes a key (the thrown messages name the action or the code only).
    logError(error, {
      op: `rateLimit.${action}`,
      sentryEveryMs: 5 * MIN * 1000, // a database outage fails every call
    });
    return { ok: false, error: "M-7" };
  }
}
