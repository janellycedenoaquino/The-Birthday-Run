"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import {
  birthdaySchema,
  onboardingBirthdaySchema,
  timeZoneInputSchema,
} from "@/lib/validation/profile";
import { parseForm } from "@/lib/validation/form";
import { requireUser } from "@/server/auth/guards";
import { runAction } from "@/server/run-action";
import { rateLimit, type RateLimitAction } from "@/server/security/rate-limit";

// Profile actions (BUILD F-2: FR-6, FR-9, FR-10). Public endpoints: each validates and guards
// itself (rule 4). All three are `user` level: onboarding and settings are exempt from FR-6.

// Every page that shows dates for the user (FR-9: all of them recompute from the new date).
const DATE_PAGES = ["/settings", "/dashboard", "/rewards", "/plan", "/history"];

type ProfileUpdate = {
  birth_month?: number;
  birth_day?: number;
  time_zone?: string;
};

/** Updates the caller's own row through their own client (RLS); exactly one row or an error. */
async function updateOwnProfile(op: RateLimitAction, values: ProfileUpdate) {
  const { supabase, user } = await requireUser();
  const limit = await rateLimit(op, { userId: user.id });
  if (!limit.ok) return limit;
  const { data: rows, error } = await supabase
    .from("profiles")
    .update(values)
    .eq("id", user.id)
    .select("id");
  if (error || rows?.length !== 1)
    throw new Error(`${op}: not exactly one row`, {
      cause: error ?? `${rows?.length ?? 0} rows`,
    });
  return null;
}

/**
 * S-101 step 1: birthday and time zone, then the dashboard. Step 2 (programs, which sets
 * `onboarded_at`) comes with Phase 2, so `onboarded_at` stays empty until then (ROADMAP).
 */
export async function saveOnboarding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(onboardingBirthdaySchema, formData);
  if (!input.ok) return input.result;

  const result = await runAction("saveOnboarding", async () => {
    // Step 1 only runs once: with both saved it's a no-op, so it can't become a second
    // birthday endpoint with its own rate limit (Settings is the place to change them, FR-9).
    const { supabase, user } = await requireUser();
    const { data: saved, error } = await supabase
      .from("profiles")
      .select("birth_month, time_zone")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !saved)
      throw new Error("saveOnboarding: could not read the profile", {
        cause: error ?? "profile row missing",
      });
    if (saved.birth_month !== null && saved.time_zone) return { ok: true };

    const refused = await updateOwnProfile("saveOnboarding", {
      birth_month: input.data.month,
      birth_day: input.data.day,
      time_zone: input.data.timeZone,
    });
    if (refused) return refused;
    revalidatePath("/dashboard");
    return { ok: true };
  });
  // Outside runAction: redirect() throws, and a double submit is harmless (same values).
  if (result.ok) redirect("/dashboard");
  return result;
}

/** S-108: a new birthday; every date page recomputes (FR-9). */
export async function updateBirthday(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(birthdaySchema, formData);
  if (!input.ok) return input.result;

  return runAction("updateBirthday", async () => {
    const refused = await updateOwnProfile("updateBirthday", {
      birth_month: input.data.month,
      birth_day: input.data.day,
    });
    if (refused) return refused;
    for (const path of DATE_PAGES) revalidatePath(path);
    return { ok: true, message: "M-257" };
  });
}

/** S-108: a new time zone moves "today" only (D4). */
export async function updateTimeZone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(timeZoneInputSchema, formData);
  if (!input.ok) return input.result;

  return runAction("updateTimeZone", async () => {
    const refused = await updateOwnProfile("updateTimeZone", {
      time_zone: input.data.timeZone,
    });
    if (refused) return refused;
    for (const path of DATE_PAGES) revalidatePath(path);
    return { ok: true, message: "M-257" };
  });
}
