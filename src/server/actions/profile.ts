"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import {
  birthdaySchema,
  onboardingBirthdaySchema,
  onboardingProgramsSchema,
  remindersSchema,
  timeZoneInputSchema,
} from "@/lib/validation/profile";
import { parseForm } from "@/lib/validation/form";
import { requireUser } from "@/server/auth/guards";
import { requirePremium } from "@/server/auth/app-guards";
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

/** S-101 (F-2 `saveOnboarding`): step 1 (birthday) or step 2 (programs), by the `step` field. */
export async function saveOnboarding(
  prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return formData.get("step") === "programs"
    ? saveOnboardingPrograms(formData)
    : saveOnboardingBirthday(prev, formData);
}

/** Step 1: birthday and time zone, then step 2. Runs once (a no-op when both are saved). */
async function saveOnboardingBirthday(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(onboardingBirthdaySchema, formData);
  if (!input.ok) return input.result;

  const result = await runAction("saveOnboarding", async () => {
    // With both saved it's a no-op, so it can't become a second birthday endpoint with its own
    // rate limit (Settings is the place to change them, FR-9).
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
  // Outside runAction: redirect() throws. /onboarding shows step 2 (or the dashboard if done).
  if (result.ok) redirect("/onboarding");
  return result;
}

/**
 * Step 2: join the chosen programs (none = "Skip for now"), then mark onboarding done
 * (`onboarded_at`, only where it's empty). Every ID must be listed, or nothing is saved (BR-3).
 */
async function saveOnboardingPrograms(
  formData: FormData,
): Promise<ActionResult> {
  // Repeated keys: read with getAll (BUILD §0.2), never Object.fromEntries.
  const ids = formData.getAll("retailerIds");
  const parsed = onboardingProgramsSchema.safeParse({
    step: formData.get("step"),
    ...(ids.length ? { retailerIds: ids } : {}),
  });
  if (!parsed.success) return { ok: false, error: "API-4" };
  const retailerIds = [...new Set(parsed.data.retailerIds ?? [])];

  const result = await runAction("saveOnboarding", async () => {
    const { supabase, user } = await requireUser();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("birth_month, time_zone, onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !profile)
      throw new Error("saveOnboarding: could not read the profile", {
        cause: error ?? "profile row missing",
      });
    if (profile.birth_month === null || !profile.time_zone)
      return { ok: false, error: "BR-1" };
    // Runs once, like step 1: after onboarding it's a no-op, so it can't become a bulk enroll
    // endpoint around `enroll`'s own rate limit.
    if (profile.onboarded_at) return { ok: true };
    const limit = await rateLimit("saveOnboarding", { userId: user.id });
    if (!limit.ok) return limit;

    if (retailerIds.length) {
      const { data: listed, error: listError } = await supabase
        .from("retailers")
        .select("id")
        .in("id", retailerIds)
        .is("retired_at", null);
      if (listError)
        throw new Error("saveOnboarding: could not check retailers", {
          cause: listError,
        });
      if (listed.length !== retailerIds.length)
        return { ok: false, error: "BR-3" };
      const { error: insertError } = await supabase.from("enrollments").upsert(
        retailerIds.map((retailer_id) => ({ user_id: user.id, retailer_id })),
        { onConflict: "user_id,retailer_id", ignoreDuplicates: true },
      );
      // Retired since the check (RLS) or removed (FK): same as enroll.
      if (insertError?.code === "42501" || insertError?.code === "23503")
        return { ok: false, error: "BR-3" };
      if (insertError)
        throw new Error("saveOnboarding: enroll failed", {
          cause: insertError,
        });
    }
    const { error: doneError } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("onboarded_at", null);
    if (doneError)
      throw new Error("saveOnboarding: could not finish", { cause: doneError });
    for (const path of ["/dashboard", "/discover", "/rewards"])
      revalidatePath(path);
    return { ok: true };
  });
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

/** S-109 (F-12, FR-42): turn reminder emails on or off. Premium only (free users get none). */
export async function setReminders(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(remindersSchema, formData);
  if (!input.ok) return input.result;

  return runAction("setReminders", async () => {
    const { supabase, user } = await requirePremium();
    const limit = await rateLimit("setReminders", { userId: user.id });
    if (!limit.ok) return limit;
    const enabled = input.data.enabled === "on";
    const { data: rows, error } = await supabase
      .from("profiles")
      .update({ reminders_enabled: enabled })
      .eq("id", user.id)
      .select("id");
    if (error || rows?.length !== 1)
      throw new Error("setReminders: not exactly one row", {
        cause: error ?? `${rows?.length ?? 0} rows`,
      });
    revalidatePath("/settings");
    return { ok: true, message: enabled ? "M-259" : "M-260" };
  });
}
