"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { today, windowFor } from "@/lib/birthday/timing";
import { parseForm } from "@/lib/validation/form";
import { reportRewardSchema } from "@/lib/validation/retailers";
import { requireOnboarded } from "@/server/auth/app-guards";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";

// reportReward (BUILD F-13: FR-48, NFR-11). A public endpoint: it validates and guards itself
// (rule 4). `onboarded` level. A fixed reason only, never free text (the schema is strict, so an
// extra field such as a note is refused with API-4). The database sets the cycle itself
// (private.set_report_cycle), so a direct insert can't pick another cycle to report again.

/** Report a reward as wrong, once per retailer per cycle (FR-48). */
export async function reportReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(reportRewardSchema, formData);
  if (!input.ok) return input.result;

  return runAction("reportReward", async () => {
    const { supabase, user, profile } = await requireOnboarded();
    const limit = await rateLimit("reportReward", { userId: user.id });
    if (!limit.ok) return limit;
    // BR-3: the retailer must exist and be listed (read as the user; retired rows are visible).
    const { data: retailer, error: rError } = await supabase
      .from("retailers")
      .select("id")
      .eq("id", input.data.retailerId)
      .is("retired_at", null)
      .maybeSingle();
    if (rError)
      throw new Error("reportReward: retailer read failed", { cause: rError });
    if (!retailer) return { ok: false, error: "BR-3" };
    const cycleStart = windowFor(
      profile.birthday,
      [],
      today(profile.timeZone, new Date()),
    ).current.cycleStart;
    const { error } = await supabase.from("reward_reports").insert({
      user_id: user.id,
      retailer_id: input.data.retailerId,
      reason: input.data.reason,
      cycle_start: cycleStart,
    });
    if (error?.code === "23505") return { ok: false, error: "BR-14" };
    // Anything else (a policy refusal, a retailer retired since the read above) is unexpected:
    // logged, and the user sees M-7 rather than a message that may not be true.
    if (error) throw new Error("reportReward failed", { cause: error });
    revalidatePath("/rewards");
    revalidatePath(`/discover/${input.data.retailerId}`);
    return { ok: true, message: "BR-20" };
  });
}
