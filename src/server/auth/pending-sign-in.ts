import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { env } from "@/server/env";
import { logError } from "@/server/errors";
import { createDetachedClient } from "@/server/supabase/server";

// The `auth_pending` cookie (decision 0026, T-118): an email link's session, held until the
// visitor answers S-113 "Is this you?". /auth/confirm's GET verifies the link and stores the new
// session here instead of in the sign-in cookies; its POST moves it in ("yes") or signs it out
// ("no"). Signed (HMAC, like `auth_recovery`), so nobody can change the email shown or the link
// type, and it expires after WINDOW_MS. HttpOnly, Secure, SameSite=Lax and Path=/auth: a
// cross-site POST doesn't carry it, so another site can't answer "yes" for the visitor.
// Its signature doubles as the held sign-in's ID: S-113's form sends it back, so "yes" can only
// accept the sign-in whose email the page showed, never one a later link put in its place.

export const PENDING_COOKIE = "auth_pending";
// The same 15 minutes as the reset marker (D24.6): the link is used up on opening, so a short
// window would make people ask for new links, which are limited to 3 an hour.
export const WINDOW_MS = 15 * 60_000;
// Browsers drop a cookie over about 4096 bytes with its name and attributes, without an error.
export const MAX_VALUE_LENGTH = 3800;

const linkTypeSchema = z.enum(["signup", "magiclink", "recovery"]);
export type LinkType = z.infer<typeof linkTypeSchema>;

const payloadSchema = z
  .object({
    accessToken: z.string().min(1).max(MAX_VALUE_LENGTH),
    refreshToken: z.string().min(1).max(512),
    type: linkTypeSchema,
    email: z.string().min(3).max(320),
    issuedAt: z.number().int().positive(),
  })
  .strict();
export type PendingSignIn = z.infer<typeof payloadSchema>;

/** A held sign-in: its ID (the signature) and whether it is still inside the window. */
export type Held = { payload: PendingSignIn; id: string; fresh: boolean };

export const heldIdSchema = z.string().regex(/^[\w-]{43}$/);

// Domain-separated from the limiter's and the recovery marker's keys, which share the secret.
const mac = (body: string) =>
  createHmac("sha256", env.RATE_LIMIT_HMAC_SECRET)
    .update(`auth_pending:${body}`)
    .digest("base64url");

export function signPending(payload: PendingSignIn): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The held sign-in if the value is ours and unaltered (expired ones too); otherwise null. */
export function verifyPending(
  value: string | undefined,
  nowMs: number,
): Held | null {
  if (!value || value.length > MAX_VALUE_LENGTH) return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(value);
  if (!match) return null;
  const [, body, given] = match;
  if (!sameId(given, mac(body))) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const age = nowMs - parsed.data.issuedAt;
  return {
    payload: parsed.data,
    id: given,
    fresh: age >= 0 && age <= WINDOW_MS,
  };
}

/** Constant-time comparison of two held-sign-in IDs. */
export function sameId(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const cookieOptions = () => ({
  ...sessionCookieOptions(env.NEXT_PUBLIC_SITE_URL),
  path: "/auth",
});

/** Holds the sign-in; false (nothing stored) if it wouldn't fit in a cookie. */
export async function setPending(payload: PendingSignIn): Promise<boolean> {
  const value = signPending(payload);
  if (value.length > MAX_VALUE_LENGTH) return false;
  (await cookies()).set(PENDING_COOKIE, value, {
    ...cookieOptions(),
    maxAge: WINDOW_MS / 1000,
  });
  return true;
}

export async function readPending(nowMs = Date.now()) {
  return verifyPending((await cookies()).get(PENDING_COOKIE)?.value, nowMs);
}

export async function clearPending() {
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/auth" });
}

/**
 * Ends a held sign-in's session on the server: its refresh token stops working. Its access token
 * is a JWT that stays valid until it expires (about an hour); the browser never had it outside
 * this HttpOnly cookie.
 */
export async function revokeHeld(held: Held | null, op: string) {
  if (!held) return;
  const { error } = await createDetachedClient().auth.admin.signOut(
    held.payload.accessToken,
    "local",
  );
  if (error) logError(error, { op });
}

/** Revokes whatever sign-in is held, then deletes the cookie. */
export async function dropPending(op: string) {
  await revokeHeld(await readPending(), op);
  await clearPending();
}
