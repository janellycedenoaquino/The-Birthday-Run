import "server-only";
import { today, windowFor, type Birthday } from "@/lib/birthday/timing";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

// The caller's own reports this cycle (FR-48, C-107): S-104 and S-105 show M-198 in place of the
// report button for these retailers. RLS returns only the caller's rows.

export async function reportedThisCycle(
  supabase: SupabaseClient<Database>,
  profile: { birthday: Birthday; timeZone: string },
  now: Date = new Date(),
): Promise<Set<string>> {
  const { cycleStart } = windowFor(
    profile.birthday,
    [],
    today(profile.timeZone, now),
  ).current;
  const { data, error } = await supabase
    .from("reward_reports")
    .select("retailer_id")
    .gte("cycle_start", cycleStart);
  if (error)
    throw new Error("reportedThisCycle: could not read reports", {
      cause: error,
    });
  return new Set(data.map((r) => r.retailer_id));
}
