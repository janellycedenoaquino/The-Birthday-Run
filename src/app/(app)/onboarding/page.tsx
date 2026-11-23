import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { msg } from "@/lib/messages";
import { saveOnboarding } from "@/server/actions/profile";
import { requireUser } from "@/server/auth/guards";

// S-101 Onboarding, step 1 (SPEC §3.3, F-2: FR-6, FR-10). `user` level: it's where
// requireOnboarded sends people. With a birthday saved there's nothing to do here yet: step 2
// (programs) comes with Phase 2, and will show while `onboarded_at` is empty.
export const metadata: Metadata = {
  title: "Your birthday",
  robots: { index: false },
};

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("birth_month, birth_day, time_zone")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-101: could not read the profile", {
      cause: error ?? "missing",
    });
  if (profile.birth_month !== null && profile.time_zone) redirect("/dashboard");

  const zones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{msg("M-105")}</h1>
      <p className="mt-2 mb-8 text-muted-foreground">{msg("M-106")}</p>
      {/* A birthday saved without a zone (possible from Settings) is kept (BUILD F-2). */}
      <OnboardingForm
        saveOnboarding={saveOnboarding}
        zones={zones}
        month={profile.birth_month}
        day={profile.birth_day}
      />
    </div>
  );
}
