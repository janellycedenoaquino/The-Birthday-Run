import { z } from "zod";
import { logError } from "@/server/errors";
import { verifyUnsubscribeToken } from "@/server/reminders/unsubscribe-token";
import { rateLimit } from "@/server/security/rate-limit";
import { getAdminClient } from "@/server/supabase/admin";

// POST /api/reminders/unsubscribe?token=… (BUILD F-12, FR-42, D15, RFC 8058). Two callers:
// a mail client's one-click (`List-Unsubscribe=One-Click` → 200 text, never a redirect) and
// S-112's form (`source=page` → 303 to the done page). A bad token gets the same answer as a
// good one (no oracle). Only this POST writes; the GET page never does, so link scanners
// turn nothing off.

const bodySchema = z.union([
  z.object({ "List-Unsubscribe": z.literal("One-Click") }).strict(),
  z.object({ source: z.literal("page") }).strict(),
]);

const done = () =>
  new Response(null, {
    status: 303,
    headers: { Location: "/reminders/unsubscribe?done=1" },
  });
const text = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export async function POST(request: Request) {
  let form: Record<string, string> = {};
  try {
    const fd = await request.formData();
    form = Object.fromEntries(
      [...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
  } catch {
    // Not a form: falls through to the one-click answer below, like any bad input.
  }
  const body = bodySchema.safeParse(form);
  const fromPage = body.success && "source" in body.data;

  const limit = await rateLimit("reminderUnsubscribe");
  if (!limit.ok)
    return fromPage
      ? new Response(null, {
          status: 303,
          headers: { Location: "/reminders/unsubscribe?error=rate_limited" },
        })
      : text("Too many requests.", 429);

  const userId = body.success
    ? verifyUnsubscribeToken(new URL(request.url).searchParams.get("token"))
    : null;
  if (userId) {
    const { error } = await getAdminClient()
      .from("profiles")
      .update({ reminders_enabled: false })
      .eq("id", userId);
    if (error)
      logError(new Error(`unsubscribe: ${error.code ?? "unknown"}`), {
        op: "reminders.unsubscribe",
      });
  }
  return fromPage ? done() : text("Reminders are off.");
}
