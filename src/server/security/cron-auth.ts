import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

// The `cron` access level (BUILD §0.2, D14): Vercel Cron sends `Authorization: Bearer
// <CRON_SECRET>`. Compared in constant time (both sides hashed to one length). No secret set →
// every call is refused (fail closed).

const digest = (s: string) => createHash("sha256").update(s).digest();

export function checkCronAuth(
  request: Pick<Request, "headers">,
  secret: string | undefined = env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
