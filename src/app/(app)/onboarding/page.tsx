import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { OnboardingDone } from "@/components/profile/onboarding-done";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { ProgramsForm } from "@/components/profile/programs-form";
import {
  formatDate,
  isWithinMinutes,
  today,
  windowFor,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { saveOnboarding } from "@/server/actions/profile";
import { requireUser } from "@/server/auth/guards";

// S-101 Onboarding (SPEC §3.3, BUILD F-2: FR-6, FR-7, FR-10). `user` level: it's where
// requireOnboarded sends people. No birthday or zone → step 1; both saved → step 2, whose
// "← Change birthday" (`?step=1`) brings step 1 back with them (and the saved zone) filled in. Saving step 2 lands on
// the "You're all set!" card (`?done=1`); done otherwise → dashboard.
export const metadata: Metadata = {
  title: "Get started",
  robots: { index: false },
};

const CARD_COLUMNS =
  "id, name, category, reward_description, reward_type, logo_file, timing_type, days_before, days_after, states_scope, state_codes";

const query = z.object({
  step: z.enum(["1"]).optional().catch(undefined),
  done: z.enum(["1"]).optional().catch(undefined),
});

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const params = query.parse(await searchParams);
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

  if (profile.onboarded_at) {
    // The finish card shows right after step 2 only, not from a bookmark days later.
    if (
      !params.done ||
      profile.birth_month === null ||
      !profile.birth_day ||
      !isWithinMinutes(profile.onboarded_at, 15, new Date())
    )
      redirect("/rewards");
    const { count, error: cError } = await supabase
      .from("enrollments")
      .select("retailer_id", { count: "exact", head: true });
    if (cError)
      throw new Error("S-101: could not count programs", { cause: cError });
    const birthday = windowFor(
      { month: profile.birth_month, day: profile.birth_day },
      [],
      today(profile.time_zone ?? "UTC", new Date()),
    ).nextBirthday;
    return (
      <Shell width="narrow" step={null}>
        <OnboardingDone
          count={count ?? 0}
          date={formatDate(birthday, "short")}
        />
      </Shell>
    );
  }

  const saved = profile.birth_month !== null && Boolean(profile.time_zone);
  if (!saved || params.step === "1") {
    const zones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
    return (
      <Shell width="narrow" step={1}>
        <Heading title={msg("M-300")} block={msg("M-300b")} />
        <p className="mb-7 text-muted-foreground">{msg("M-106")}</p>
        {/* A birthday saved without a zone (possible from Settings) is kept (BUILD F-2). */}
        <OnboardingForm
          saveOnboarding={saveOnboarding}
          zones={zones}
          month={profile.birth_month}
          day={profile.birth_day}
          timeZone={profile.time_zone}
        />
      </Shell>
    );
  }

  const [
    { data: retailers, error: rError },
    { data: enrolled, error: eError },
  ] = await Promise.all([
    // The popular brands first, as in the prototype; then A to Z.
    supabase
      .from("retailers")
      .select(CARD_COLUMNS)
      .is("retired_at", null)
      .order("is_popular", { ascending: false })
      .order("name"),
    supabase.from("enrollments").select("retailer_id"),
  ]);
  if (rError || eError)
    throw new Error("S-101: could not read programs", {
      cause: rError ?? eError,
    });
  return (
    <Shell
      width="wide"
      step={2}
      top={
        <Link
          href="/onboarding?step=1"
          className="mb-3 inline-block text-sm font-bold text-[var(--navy)] underline decoration-[var(--bubblegum)] decoration-[3px] underline-offset-[3px] dark:text-foreground"
        >
          {msg("M-301j")}
        </Link>
      }
    >
      <ProgramsForm
        saveOnboarding={saveOnboarding}
        retailers={retailers}
        enrolledIds={enrolled.map((e) => e.retailer_id)}
        heading={
          <>
            <Heading title={msg("M-301")} block={msg("M-301b")} />
            <p className="text-muted-foreground">{msg("M-301c")}</p>
          </>
        }
      />
    </Shell>
  );
}

function Heading({ title, block }: { title: string; block: string }) {
  return (
    <h1 className="headline mt-2 mb-2 text-[30px] leading-[1.1] sm:text-[38px]">
      {title} <span className="headline-block">{block}</span>
    </h1>
  );
}

function Shell({
  width,
  step,
  top,
  children,
}: {
  width: "narrow" | "wide";
  step: number | null;
  /** Above the step label (step 2's "← Change birthday", as in the prototype). */
  top?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Decision 0016: one frosted card on the still glow, no motion of its own (so no pause
  // control); narrow for the birthday and the finish, wide for the programs, as in the
  // prototype. Each step turns in on its vertical axis; not with reduced motion (motion-safe).
  return (
    <div
      className={`mx-auto w-full px-4 py-10 [perspective:1200px] sm:px-6 ${width === "wide" ? "max-w-[990px]" : "max-w-[570px]"}`}
    >
      <div
        key={step ?? "done"}
        className="frosted rounded-[28px] px-5 py-8 motion-safe:animate-[card-turn-in_0.8s_ease-out] sm:px-9"
      >
        {top}
        {step ? (
          <p className="text-xs font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
            {msg("M-118").replace("{step}", String(step))}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
