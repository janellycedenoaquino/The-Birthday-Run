import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";

// Reminder turn-off tokens (BUILD F-12, D15, T-107): `v1.<userId>.<HMAC>`, the HMAC of
// "reminders:" + userId under REMINDER_UNSUBSCRIBE_SECRET. No expiry (CAN-SPAM: links must work
// ≥ 30 days); rotating the secret voids every old link. No secret → no token, nothing verifies.

const PREFIX = "v1";
const uuid = z.uuid();

const mac = (userId: string, secret: string) =>
  createHmac("sha256", secret)
    .update(`reminders:${userId}`)
    .digest("base64url");

export function createUnsubscribeToken(
  userId: string,
  secret: string | undefined = env.REMINDER_UNSUBSCRIBE_SECRET,
): string | null {
  if (!secret || !uuid.safeParse(userId).success) return null;
  return `${PREFIX}.${userId}.${mac(userId, secret)}`;
}

/** The token's user ID, or null for anything malformed, forged or signed with another secret. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string | undefined = env.REMINDER_UNSUBSCRIBE_SECRET,
): string | null {
  if (!secret || !token || token.length > 200) return null;
  const [prefix, userId, signature, extra] = token.split(".");
  if (prefix !== PREFIX || extra !== undefined || !userId || !signature)
    return null;
  if (!uuid.safeParse(userId).success) return null;
  const expected = Buffer.from(mac(userId, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}
