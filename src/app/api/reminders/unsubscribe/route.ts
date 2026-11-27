import { z } from "zod";
import { routeFormFields } from "@/lib/validation/form";
import { logError } from "@/server/errors";
import { verifyUnsubscribeToken } from "@/server/reminders/unsubscribe-token";
import { rateLimit } from "@/server/security/rate-limit";
import { getAdminClient } from "@/server/supabase/admin";

// POST /api/reminders/unsubscribe?token=… (BUILD F-12, FR-42, D15, RFC 8058). Two callers:
// a mail client's one-click (`List-Unsubscribe=One-Click` → 200 text, never a redirect) and
// S-112's form (`source=page` → 303 to the done page). A bad token gets the same answer as a
// good one (no oracle). Only this POST writes; the GET page never does, so link scanners
// turn nothing off.

// Not strict: a mail client may add fields; only these two keys decide the path.
const bodySchema = z.union([
  z.object({ "List-Unsubscribe": z.literal("One-Click") }),
  z.object({ source: z.literal("page") }),
]);

const pageRedirect = (query: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: `/reminders/unsubscribe?${query}` },
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
  // Not a form → {}: falls through to the one-click answer below, like any bad input.
  const body = bodySchema.safeParse(await routeFormFields(request));
  const fromPage = body.success && "source" in body.data;

  // Per-IP limit for the page form only. One-click POSTs come from mail providers' shared IPs
  // (Gmail, Yahoo), so a per-IP limit would refuse real turn-offs; they need a valid HMAC
  // token to write anything, and the write is idempotent.
  if (fromPage) {
    const limit = await rateLimit("reminderUnsubscribe");
    if (!limit.ok) return pageRedirect("error=rate_limited");
  }

  const userId = body.success
    ? verifyUnsubscribeToken(new URL(request.url).searchParams.get("token"))
    : null;
  if (userId) {
    const { error } = await getAdminClient()
      .from("profiles")
      .update({ reminders_enabled: false })
      .eq("id", userId);
    if (error) {
      logError(new Error(`unsubscribe: ${error.code ?? "unknown"}`), {
        op: "reminders.unsubscribe",
      });
      // Never claim "off" when it isn't: the page says try again; a mail client may retry.
      return fromPage
        ? pageRedirect("error=failed")
        : text("Something went wrong. Please try again.", 500);
    }
  }
  // A bad or missing token gets the same answer as a good one (no oracle, BUILD §0.2).
  return fromPage ? pageRedirect("done=1") : text("Reminders are off.");
}
