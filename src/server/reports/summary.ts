import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportReason } from "@/lib/validation/retailers";
import type { Database } from "@/lib/types/database.types";

// The report summary for the forward-reports Action (BUILD F-13, D16, NFR-11). Counts only: a
// retailer ID, a fixed reason and a number, never a user ID, email, row ID or date. Claiming
// stamps every unforwarded report with a new batch; acking that batch marks them forwarded. A
// batch never acked is offered again by the next claim.

type Admin = SupabaseClient<Database>;
export type SummaryItem = {
  retailerId: string;
  reason: ReportReason;
  count: number;
};
export type PendingSummary = { batchId: string | null; items: SummaryItem[] };

export async function claimPendingSummary({
  admin,
}: {
  admin: Admin;
}): Promise<PendingSummary> {
  const batchId = randomUUID();
  const { data, error } = await admin.rpc("claim_report_batch", {
    p_batch: batchId,
  });
  if (error) throw new Error("claimPendingSummary failed", { cause: error });
  if (!data.length) return { batchId: null, items: [] };
  return {
    batchId,
    items: data.map((r) => ({
      retailerId: r.retailer_id,
      reason: r.reason,
      count: r.report_count,
    })),
  };
}

export async function ackBatch({
  admin,
  batchId,
}: {
  admin: Admin;
  batchId: string;
}): Promise<number> {
  const { data, error } = await admin.rpc("ack_report_batch", {
    p_batch: batchId,
  });
  if (error) throw new Error("ackBatch failed", { cause: error });
  return data;
}
