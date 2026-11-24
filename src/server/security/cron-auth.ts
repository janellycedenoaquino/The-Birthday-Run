import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

// The `cron` and `reports-export` access levels (BUILD §0.2, D14, D16): the caller sends
// `Authorization: Bearer <secret>`. Compared in constant time (both sides hashed to one length).
// No secret set → every call is refused (fail closed). Two secrets, so one leak doesn't open both.

const digest = (s: string) => createHash("sha256").update(s).digest();

function checkBearer(
  request: Pick<Request, "headers">,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/** Vercel Cron (`CRON_SECRET`). */
export function checkCronAuth(
  request: Pick<Request, "headers">,
  secret: string | undefined = env.CRON_SECRET,
): boolean {
  return checkBearer(request, secret);
}

/** The forward-reports Action (`REPORTS_EXPORT_SECRET`). */
export function checkReportsAuth(
  request: Pick<Request, "headers">,
  secret: string | undefined = env.REPORTS_EXPORT_SECRET,
): boolean {
  return checkBearer(request, secret);
}
