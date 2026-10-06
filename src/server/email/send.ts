import "server-only";
import { Resend } from "resend";
import { env } from "@/server/env";
import { logError } from "@/server/errors";

// The app's own email transport (BUILD F-5, D7): only the welcome email uses it; Supabase sends
// the auth emails itself. Resend in deployed apps, the local Supabase stack's Mailpit in dev and
// CI (week-1 check 2: its /api/v1/send is on). Never throws; the recipient is never logged.

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const MAILPIT_TIMEOUT_MS = 5_000;
// The welcome email is awaited before a sign-in redirect: a stalled provider mustn't hang it.
const RESEND_TIMEOUT_MS = 10_000;

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);

/** `Name <addr>` or `addr` (the env schema checks the format, D24.25). */
function parseFrom(from: string): { Name?: string; Email: string } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return match
    ? { Name: match[1] || undefined, Email: match[2] }
    : { Email: from };
}

export async function sendEmail(
  { to, subject, html, text, replyTo }: Email,
  { fetchFn = fetch }: { fetchFn?: typeof fetch } = {},
): Promise<{ ok: boolean }> {
  try {
    if (env.EMAIL_TRANSPORT === "resend") {
      const resend = new Resend(env.RESEND_API_KEY);
      const { error } = await withTimeout(
        resend.emails.send({
          from: env.EMAIL_FROM,
          to,
          subject,
          html,
          text,
          ...(replyTo && { replyTo }),
        }),
        RESEND_TIMEOUT_MS,
      );
      if (error) throw new Error(`resend: ${error.name}`);
      return { ok: true };
    }
    const res = await fetchFn(`${env.MAILPIT_URL}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: parseFrom(env.EMAIL_FROM),
        To: [{ Email: to }],
        ...(replyTo && { ReplyTo: [{ Email: replyTo }] }),
        Subject: subject,
        HTML: html,
        Text: text,
      }),
      signal: AbortSignal.timeout(MAILPIT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`mailpit: HTTP ${res.status}`);
    return { ok: true };
  } catch (error) {
    // The message names the transport and status only; never the recipient or content.
    logError(error, { op: "sendEmail" });
    return { ok: false };
  }
}
