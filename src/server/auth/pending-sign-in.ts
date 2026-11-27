import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { env } from "@/server/env";

// The `auth_pending` cookie (decision 0026, T-118): an email link's session, held until the
// visitor answers S-113 "Is this you?". /auth/confirm's GET verifies the link and stores the new
// session here instead of in the sign-in cookies; its POST moves it in ("yes") or signs it out
// ("no"). Signed (HMAC, like `auth_recovery`), so nobody can change the email shown or the link
// type, and it expires after WINDOW_MS. HttpOnly, Secure, SameSite=Lax and Path=/auth: a
// cross-site POST doesn't carry it, so another site can't answer "yes" for the visitor.

export const PENDING_COOKIE = "auth_pending";
export const WINDOW_MS = 5 * 60_000;

const linkTypeSchema = z.enum(["signup", "magiclink", "recovery"]);
export type LinkType = z.infer<typeof linkTypeSchema>;

const payloadSchema = z
  .object({
    accessToken: z.string().min(1).max(4096),
    refreshToken: z.string().min(1).max(512),
    type: linkTypeSchema,
    email: z.string().min(3).max(320),
    issuedAt: z.number().int().positive(),
  })
  .strict();
export type PendingSignIn = z.infer<typeof payloadSchema>;

// Domain-separated from the limiter's and the recovery marker's keys, which share the secret.
const mac = (body: string) =>
  createHmac("sha256", env.RATE_LIMIT_HMAC_SECRET)
    .update(`auth_pending:${body}`)
    .digest("base64url");

export function signPending(payload: PendingSignIn): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The payload if the value is ours, unaltered and within the window; otherwise null. */
export function verifyPending(
  value: string | undefined,
  nowMs: number,
): PendingSignIn | null {
  const match = /^([\w-]{1,8000})\.([\w-]{43})$/.exec(value ?? "");
  if (!match) return null;
  const [, body, given] = match;
  const expected = Buffer.from(mac(body));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const age = nowMs - parsed.data.issuedAt;
  return age >= 0 && age <= WINDOW_MS ? parsed.data : null;
}

const cookieOptions = () => ({
  ...sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
  path: "/auth",
});

export async function setPending(payload: PendingSignIn) {
  (await cookies()).set(PENDING_COOKIE, signPending(payload), {
    ...cookieOptions(),
    maxAge: WINDOW_MS / 1000,
  });
}

export async function readPending(nowMs = Date.now()) {
  return verifyPending((await cookies()).get(PENDING_COOKIE)?.value, nowMs);
}

export async function clearPending() {
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/auth" });
}
