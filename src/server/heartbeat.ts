import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

// D16 heartbeat: when the reminder cron last finished. No user data, service_role only.

type Admin = SupabaseClient<Database>;
export type Job = Database["public"]["Tables"]["job_heartbeats"]["Row"]["job"];

export async function recordHeartbeat(
  admin: Admin,
  job: Job,
  now: Date,
): Promise<void> {
  const { error } = await admin
    .from("job_heartbeats")
    .upsert({ job, last_run_at: now.toISOString() });
  if (error) throw new Error("recordHeartbeat failed", { cause: error });
}

/** The job's last run as Postgres's ISO time (with offset), or null when it has never run. */
export async function lastHeartbeat(
  admin: Admin,
  job: Job,
): Promise<string | null> {
  const { data, error } = await admin
    .from("job_heartbeats")
    .select("last_run_at")
    .eq("job", job)
    .maybeSingle();
  if (error) throw new Error("lastHeartbeat failed", { cause: error });
  return data?.last_run_at ?? null;
}
