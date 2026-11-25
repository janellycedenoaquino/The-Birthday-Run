import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { ProgramsForm } from "@/components/profile/programs-form";
import { msg } from "@/lib/messages";
import { saveOnboarding } from "@/server/actions/profile";
import { requireUser } from "@/server/auth/guards";

// S-101 Onboarding (SPEC §3.3, BUILD F-2: FR-6, FR-7, FR-10). `user` level: it's where
// requireOnboarded sends people. Done (`onboarded_at` set) → dashboard; no birthday or zone →
// step 1; both saved → step 2, so going back keeps the birthday.
export const metadata: Metadata = {
  title: "Get started",
  robots: { index: false },
};

const CARD_COLUMNS =
  "id, name, category, reward_description, reward_type, logo_file, timing_type, days_before, days_after, states_scope, state_codes";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("birth_month, birth_day, time_zone, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-101: could not read the profile", {
      cause: error ?? "missing",
    });
  if (profile.onboarded_at) redirect("/dashboard");
  const step = profile.birth_month !== null && profile.time_zone ? 2 : 1;

  if (step === 1) {
    const zones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
    return (
      <Shell step={1} title={msg("M-300")} block={msg("M-300b")}>
        <p className="mb-7 text-muted-foreground">{msg("M-106")}</p>
        {/* A birthday saved without a zone (possible from Settings) is kept (BUILD F-2). */}
        <OnboardingForm
          saveOnboarding={saveOnboarding}
          zones={zones}
          month={profile.birth_month}
          day={profile.birth_day}
        />
      </Shell>
    );
  }

  const [
    { data: retailers, error: rError },
    { data: enrolled, error: eError },
  ] = await Promise.all([
    supabase
      .from("retailers")
      .select(CARD_COLUMNS)
      .is("retired_at", null)
      .order("name"),
    supabase.from("enrollments").select("retailer_id"),
  ]);
  if (rError || eError)
    throw new Error("S-101: could not read programs", {
      cause: rError ?? eError,
    });
  return (
    <Shell step={2} title={msg("M-301")} block={msg("M-301b")}>
      <p className="mb-5 text-muted-foreground">{msg("M-301c")}</p>
      <ProgramsForm
        saveOnboarding={saveOnboarding}
        retailers={retailers}
        enrolledIds={enrolled.map((e) => e.retailer_id)}
      />
    </Shell>
  );
}

function Shell({
  step,
  title,
  block,
  children,
}: {
  step: number;
  title: string;
  block: string;
  children: React.ReactNode;
}) {
  // Decision 0016: one frosted card on the still glow, no motion of its own (so no pause
  // control). Each step turns in on its vertical axis; not when the device asks for reduced
  // motion (motion-safe).
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 [perspective:1200px] sm:px-6">
      <div
        key={step}
        className="frosted rounded-[28px] px-6 py-8 motion-safe:animate-[card-turn-in_0.8s_ease-out] sm:px-9"
      >
        <p className="text-xs font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
          {msg("M-118").replace("{step}", String(step))}
        </p>
        <h1 className="headline mt-2 mb-2 text-[32px] leading-[1.1] sm:text-[38px]">
          {title} <span className="headline-block">{block}</span>
        </h1>
        {children}
      </div>
    </div>
  );
}
