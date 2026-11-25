import { logError } from "@/server/errors";
import { recordHeartbeat } from "@/server/heartbeat";
import { createUnsubscribeToken } from "@/server/reminders/unsubscribe-token";
import { runReminders, type RunCounts } from "@/server/reminders/run";
import { checkCronAuth } from "@/server/security/cron-auth";
import { sendEmail } from "@/server/email/send";
import { getSiteUrl } from "@/server/site-url";
import { getAdminClient } from "@/server/supabase/admin";

// GET /api/cron/reminders (BUILD F-12, D14): the daily Vercel Cron call. `cron` level: the
// CRON_SECRET bearer, else 401. Returns counts only, never addresses or IDs. Unlimited (§0.4).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!checkCronAuth(request))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  const empty: RunCounts = { candidates: 0, sent: 0, failed: 0, deferred: 0 };
  try {
    const admin = getAdminClient();
    const now = new Date();
    const counts = await runReminders({
      admin,
      send: sendEmail,
      now,
      siteUrl: getSiteUrl(),
      tokenFor: (userId) => createUnsubscribeToken(userId),
    });
    // D16 heartbeat, after a finished run. Its own failure is logged, never the run's result.
    await recordHeartbeat(admin, "reminders", now).catch((error: unknown) =>
      logError(error, { op: "cron.heartbeat" }),
    );
    return Response.json(counts, { headers: NO_STORE });
  } catch (error) {
    logError(error, { op: "cron.reminders" });
    return Response.json(empty, { status: 500, headers: NO_STORE });
  }
}
