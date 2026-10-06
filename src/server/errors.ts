import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { MessageId } from "@/lib/messages";
import { redactString } from "@/lib/observability/scrub";

// Errors and messages (BUILD F-2, §0.3, §0.7; NFR-9, rules 12 and 20). Users only ever see a
// catalogue message ID; the details go to Sentry (scrubbed by its beforeSend) and the server log.
// `runAction` lives in src/server/run-action.ts (it needs the guards; the proxy imports this file).

// Supabase `AuthError.code` → message ID for codes every feature treats alike (§0.3, SPEC §3.4).
// Features that must mask an outcome (NFR-12) map before calling this.
const SUPABASE_CODES = new Map<string, MessageId>([
  ["captcha_failed", "M-6"],
  ["same_password", "API-7"],
  ["weak_password", "M-32"],
  ["over_request_rate_limit", "M-5"], // Supabase's per-IP limit (SPEC §3.4)
]);

/** A Supabase error code as a §0.3 message ID; anything unknown is logged and becomes M-7. */
export function toUserMessage(code: string | undefined): MessageId {
  const id = code ? SUPABASE_CODES.get(code) : undefined;
  if (id) return id;
  logError(new Error(`Unmapped Supabase error code: ${code || "(none)"}`), {
    op: "toUserMessage",
  });
  return "M-7";
}

// When each throttled `op` last went to Sentry, per server instance. Keys are fixed operation
// names, never user data.
const lastReported = new Map<string, number>();

/**
 * Reports an unexpected error: Sentry (scrubbed by `scrubEvent`) plus one redacted console line.
 * The user ID stays out of Sentry (D15 drops `user`); only the server log line carries it.
 * `sentryEveryMs`: send this `op` to Sentry at most once per that many ms (per instance), for
 * errors that repeat on every request during an outage and would use up the free plan's quota;
 * the console line is still written every time.
 * Never throws: logging must not turn a handled failure into a crash.
 */
export function logError(
  error: unknown,
  {
    op,
    userId,
    sentryEveryMs,
  }: { op: string; userId?: string; sentryEveryMs?: number },
): void {
  try {
    const now = Date.now();
    const last = lastReported.get(op);
    if (!sentryEveryMs || last === undefined || now - last >= sentryEveryMs) {
      if (sentryEveryMs) lastReported.set(op, now);
      Sentry.captureException(error, { tags: { op } });
    }
  } catch {
    // Sentry failing is not the caller's problem; the console line below still records it.
  }
  try {
    const detail =
      error instanceof Error
        ? (error.stack ?? `${error.name}: ${error.message}`)
        : "non-Error value";
    const who = userId ? ` user=${userId}` : "";
    console.error(`[${op}]${who} ${redactString(detail)}`);
  } catch {
    // Nothing left to report to.
  }
}

/** Awaits the rest of `ms` since `start` (a `Date.now()` value): D24.10's minimum response time. */
export async function padToMinimum(start: number, ms: number): Promise<void> {
  const remaining = start + ms - Date.now();
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
}

export type Notice = "account_deleted" | "password_set" | "password_changed";

/** `path` with `?notice=<value>` added (§0.2 enum). `path` must be a same-site path. */
export function withNotice(path: string, value: Notice): string {
  const base = "http://x.invalid";
  const url = new URL(path, base);
  if (!path.startsWith("/") || url.origin !== base)
    throw new Error("withNotice needs a same-site path");
  url.searchParams.set("notice", value);
  return url.pathname + url.search + url.hash;
}
