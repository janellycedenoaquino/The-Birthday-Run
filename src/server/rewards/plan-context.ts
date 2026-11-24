import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  localTime,
  timingOf,
  today as todayIn,
  windowFor,
  type Birthday,
  type LocalDate,
} from "@/lib/birthday/timing";
import { plannable, type PlanRetailer } from "@/lib/rewards/plan";
import type { Database } from "@/lib/types/database.types";

const COLUMNS = "id, name, logo_file, timing_type, days_before, days_after";

/** What S-106 and the group actions need: the window, the plannable rows, today and now. */
export async function loadPlanContext(
  supabase: SupabaseClient<Database>,
  profile: { birthday: Birthday; timeZone: string },
) {
  const now = new Date();
  const today = todayIn(profile.timeZone, now);
  const { data, error } = await supabase
    .from("enrollments")
    .select(`retailer:retailers!inner(${COLUMNS})`)
    .is("retailer.retired_at", null);
  if (error) throw new Error("plan: could not read programs", { cause: error });
  const enrolled: PlanRetailer[] = data.map((row) => row.retailer);
  // Only pickups that can count: on or after the planning cycle's start (decision 0008).
  const cycleStart = windowFor(profile.birthday, enrolled.map(timingOf), today)
    .planning.cycleStart;
  const { data: pickups, error: pError } = await supabase
    .from("pickups")
    .select("retailer_id, picked_up_on")
    .gte("picked_up_on", cycleStart);
  if (pError)
    throw new Error("plan: could not read pickups", { cause: pError });
  const { window, rows, all } = plannable({
    birthday: profile.birthday,
    today,
    enrolled,
    pickups: pickups.map((p) => ({
      retailerId: p.retailer_id,
      date: p.picked_up_on as LocalDate,
    })),
  });
  return {
    window,
    rows,
    all,
    today,
    nowTime: localTime(profile.timeZone, now),
  };
}
