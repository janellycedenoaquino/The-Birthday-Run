import "server-only";
import { cache } from "react";
import type { Birthday } from "@/lib/birthday/timing";
import { fail, requireUser } from "@/server/auth/guards";

// The app's access levels on top of the Template guards (BUILD §0.2, F-2; decision 0009).

export type OnboardedProfile = {
  birthday: Birthday;
  timeZone: string;
  onboardedAt: string | null;
  displayName: string | null;
  remindersEnabled: boolean;
};

/**
 * `requireUser()` plus a saved birthday and time zone (FR-6). Pages without them redirect to
 * `/onboarding`; actions refuse with BR-1. One profile read per request (React `cache`).
 */
export const requireOnboarded = cache(async () => {
  const session = await requireUser();
  const { data, error } = await session.supabase
    .from("profiles")
    .select(
      "birth_month, birth_day, time_zone, onboarded_at, display_name, reminders_enabled",
    )
    .eq("id", session.user.id)
    .maybeSingle();
  if (error || !data)
    // Fails closed, like requireUser's password step: an error, never a way past the check.
    throw new Error("requireOnboarded: could not read the profile", {
      cause: error ?? "profile row missing",
    });
  if (data.birth_month === null || data.birth_day === null || !data.time_zone)
    return fail("not_onboarded");
  const profile: OnboardedProfile = {
    birthday: { month: data.birth_month, day: data.birth_day },
    timeZone: data.time_zone,
    onboardedAt: data.onboarded_at,
    displayName: data.display_name,
    remindersEnabled: data.reminders_enabled,
  };
  return { ...session, profile };
});
