import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { isRecoverySession } from "@/server/auth/guards";
import { env } from "@/server/env";

// The `auth_recovery` marker (BUILD §0.7, F-8; D24.6; decisions/0014). Week-1 check 5: GoTrue
// records a reset link's session as amr "otp", like a magic link, so the JWT can't say "this came
// from a reset link". /auth/confirm sets this marker for type=recovery instead. It's signed (an
// HMAC over the user id, the reset session's id and the issue time) and expires, so a session
// holder can't forge one, and it counts only in the session the reset link created: not in a later
// sign-in on the same browser (#15 review).

export const RECOVERY_COOKIE = "auth_recovery";
const WINDOW_MS = 15 * 60_000; // D24.6
// Domain-separated from the limiter's keys, which share the secret.
const mac = (userId: string, sessionId: string, issuedAt: number) =>
  createHmac("sha256", env.RATE_LIMIT_HMAC_SECRET)
    .update(`auth_recovery:${userId}:${sessionId}:${issuedAt}`)
    .digest("base64url");

export function signRecoveryMarker(
  userId: string,
  sessionId: string,
  nowMs: number,
): string {
  return `${nowMs}.${mac(userId, sessionId, nowMs)}`;
}

/** The marker is for this user and this session, unaltered, and within the window. */
export function verifyRecoveryMarker(
  value: string | undefined,
  userId: string,
  sessionId: string | undefined,
  nowMs: number,
): boolean {
  if (!sessionId) return false;
  const match = /^(\d{13})\.([\w-]{43})$/.exec(value ?? "");
  if (!match) return false;
  const issuedAt = Number(match[1]);
  if (issuedAt > nowMs || nowMs - issuedAt > WINDOW_MS) return false;
  const expected = Buffer.from(mac(userId, sessionId, issuedAt));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function setRecoveryMarker(userId: string, sessionId: string) {
  (await cookies()).set(
    RECOVERY_COOKIE,
    signRecoveryMarker(userId, sessionId, Date.now()),
    {
      ...sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
      maxAge: WINDOW_MS / 1000,
    },
  );
}

export async function hasRecoveryMarker(
  userId: string,
  sessionId: string | undefined,
): Promise<boolean> {
  const value = (await cookies()).get(RECOVERY_COOKIE)?.value;
  return verifyRecoveryMarker(value, userId, sessionId, Date.now());
}

export async function clearRecoveryMarker() {
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: "/" });
}

/** The `recovery` level (§0.2) right now: the JWT's amr or this session's signed marker. */
export async function isRecoverySessionNow(
  userId: string,
  claims: Parameters<typeof isRecoverySession>[0] & { session_id?: unknown },
): Promise<boolean> {
  const sessionId =
    typeof claims.session_id === "string" ? claims.session_id : undefined;
  return isRecoverySession(
    claims,
    Date.now(),
    await hasRecoveryMarker(userId, sessionId),
  );
}
