import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { timingOf, type Timing } from "@/lib/birthday/timing";
import type { Database } from "@/lib/types/database.types";

/** The timings of the caller's listed (non-retired) programs, for windowFor/cycleFor (RLS: own). */
export async function enrolledTimings(
  supabase: SupabaseClient<Database>,
): Promise<Timing[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("retailer:retailers!inner(timing_type, days_before, days_after)")
    .is("retailer.retired_at", null);
  if (error)
    throw new Error("could not read enrolled timings", { cause: error });
  return data.map((e) => timingOf(e.retailer));
}
