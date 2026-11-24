import { z } from "zod";
import { logError } from "@/server/errors";
import { ackBatch } from "@/server/reports/summary";
import { checkReportsAuth } from "@/server/security/cron-auth";
import { getAdminClient } from "@/server/supabase/admin";

// POST /api/reports/ack (BUILD F-13, D16): marks a claimed batch forwarded, once the Action has
// written its issues. `reports-export` level, else 401. Body `{ batchId }` (Zod, else 400).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const ackSchema = z.object({ batchId: z.uuid() }).strict();

export async function POST(request: Request) {
  if (!checkReportsAuth(request))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const input = ackSchema.safeParse(body);
  if (!input.success)
    return Response.json(
      { error: "invalid_input" },
      { status: 400, headers: NO_STORE },
    );
  try {
    const acked = await ackBatch({
      admin: getAdminClient(),
      batchId: input.data.batchId,
    });
    return Response.json({ acked }, { headers: NO_STORE });
  } catch (error) {
    logError(error, { op: "reports.ack" });
    return Response.json(
      { error: "failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
