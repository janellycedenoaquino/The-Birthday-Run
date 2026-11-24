import { logError } from "@/server/errors";
import { claimPendingSummary } from "@/server/reports/summary";
import { checkReportsAuth } from "@/server/security/cron-auth";
import { getAdminClient } from "@/server/supabase/admin";

// GET /api/reports/pending (BUILD F-13, D16): the forward-reports Action's daily call.
// `reports-export` level: the REPORTS_EXPORT_SECRET bearer, else 401. Returns a batch ID and
// counts per retailer and reason only. Unlimited (§0.4). Claiming stamps the batch.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!checkReportsAuth(request))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  try {
    const summary = await claimPendingSummary({ admin: getAdminClient() });
    return Response.json(summary, { headers: NO_STORE });
  } catch (error) {
    logError(error, { op: "reports.pending" });
    return Response.json(
      { error: "failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
