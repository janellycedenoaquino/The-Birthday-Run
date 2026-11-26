"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { parseForm } from "@/lib/validation/form";
import { retailerIdInputSchema } from "@/lib/validation/retailers";
import { requireOnboarded } from "@/server/auth/app-guards";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";

// Enrollment actions (BUILD F-3: FR-7, FR-8). Public endpoints: each validates and guards itself
// (rule 4). `onboarded` level: without a birthday they refuse with BR-1.

const PAGES = ["/discover", "/rewards", "/plan"];

/** Join a program. Twice is fine (one row); a retired or unknown retailer → BR-3. */
export async function enroll(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(retailerIdInputSchema, formData);
  if (!input.ok) return input.result;

  return runAction("enroll", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("enroll", { userId: user.id });
    if (!limit.ok) return limit;
    const { error } = await supabase
      .from("enrollments")
      .upsert(
        { user_id: user.id, retailer_id: input.data.retailerId },
        { onConflict: "user_id,retailer_id", ignoreDuplicates: true },
      );
    // The insert policy refuses retired retailers (42501); an unknown ID fails the FK (23503).
    if (error?.code === "42501" || error?.code === "23503")
      return { ok: false, error: "BR-3" };
    if (error) throw new Error("enroll failed", { cause: error });
    for (const path of PAGES) revalidatePath(path);
    revalidatePath(`/discover/${input.data.retailerId}`);
    return { ok: true };
  });
}

/** Leave a program. Not enrolled is fine; pickups stay (FR-8). */
export async function unenroll(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(retailerIdInputSchema, formData);
  if (!input.ok) return input.result;

  return runAction("unenroll", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("unenroll", { userId: user.id });
    if (!limit.ok) return limit;
    const { error } = await supabase
      .from("enrollments")
      .delete()
      .eq("user_id", user.id)
      .eq("retailer_id", input.data.retailerId);
    if (error) throw new Error("unenroll failed", { cause: error });
    for (const path of PAGES) revalidatePath(path);
    revalidatePath(`/discover/${input.data.retailerId}`);
    return { ok: true };
  });
}
