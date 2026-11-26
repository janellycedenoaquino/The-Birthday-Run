import type { Metadata } from "next";
import {
  Bell,
  Cake,
  Download,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";
import { SupportLinkText } from "@/components/layout/support-link-text";
import { BirthdayCard } from "@/components/profile/birthday-card";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { TwoStepCard } from "@/components/settings/two-step-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { msg } from "@/lib/messages";
import {
  changePassword,
  deleteAccount,
  updateDisplayName,
} from "@/server/actions/account";
import { RemindersSwitch } from "@/components/settings/reminders-switch";
import {
  setReminders,
  updateBirthday,
  updateTimeZone,
} from "@/server/actions/profile";
import {
  confirmMfaEnrollment,
  disableMfa,
  startMfaEnrollment,
} from "@/server/actions/mfa";
import { isRecentSignIn, requireUser } from "@/server/auth/guards";
import { getEntitlement } from "@/server/premium/entitlement";
import { PremiumStatus } from "@/components/billing/premium-status";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";

// S-13 Settings (SPEC §3.3, BUILD F-11, FR-19): one card per section, each with its own form.
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

// Decision 0016: each section has a line icon on its own pastel colour (never emoji), used in the
// side menu and the card's header band; Delete account is red.
const LOOK: Record<string, { Icon: LucideIcon; tone: string }> = {
  profile: { Icon: UserRound, tone: "var(--glow-blue)" },
  birthday: { Icon: Cake, tone: "var(--glow-pink)" },
  reminders: { Icon: Bell, tone: "var(--glow-mint)" },
  password: { Icon: KeyRound, tone: "var(--glow-mint)" },
  "two-step": { Icon: ShieldCheck, tone: "var(--glow-blue)" },
  premium: { Icon: Sparkles, tone: "var(--glow-pink)" },
  "your-data": { Icon: Download, tone: "var(--glow-mint)" },
  "delete-account": {
    Icon: Trash2,
    tone: "color-mix(in srgb, var(--destructive) 16%, transparent)",
  },
};

function SectionIcon({ id, onBand = false }: { id: string; onBand?: boolean }) {
  const look = LOOK[id];
  if (!look) return null;
  return (
    <span
      aria-hidden="true"
      // On the card's band (already this colour) the tile is white, so it still shows.
      style={onBand ? undefined : { background: look.tone }}
      className={`grid size-7 shrink-0 place-items-center rounded-lg text-[var(--navy)] dark:text-foreground ${onBand ? "bg-white/85 dark:bg-white/10" : ""}`}
    >
      <look.Icon className="size-4" />
    </span>
  );
}

function Card({
  id,
  title,
  destructive = false,
  children,
}: {
  id: string;
  title: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-20 overflow-hidden rounded-[22px] bg-white/85 dark:bg-white/5 ${destructive ? "shadow-[0_0_0_2px_var(--destructive)]" : "shadow-[0_0_0_1.5px_var(--border)]"}`}
    >
      <div
        style={{ background: LOOK[id]?.tone }}
        className="flex items-center gap-2.5 px-6 py-3 text-[var(--navy)] dark:text-foreground"
      >
        <SectionIcon id={id} onBand />
        <h2 id={`${id}-title`} className="text-lg font-extrabold">
          {title}
        </h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

/** The recent-sign-in gate (D9): UX only; the actions check again. */
function ReauthGate() {
  return (
    <div className="grid gap-4">
      <p>{msg("M-20")}</p>
      <div>
        <Button asChild size="lg" variant="outline">
          <Link href="/auth/reauthenticate?next=%2Fsettings">
            Confirm it&apos;s you
          </Link>
        </Button>
      </div>
    </div>
  );
}

async function loadSettings() {
  const { supabase, user, claims } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "display_name, password_set_at, birth_month, birth_day, time_zone, reminders_enabled",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-13: could not read the profile", {
      cause: error ?? "missing",
    });
  const mfaEnabled = (user.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  // S-110 (FR-35, FR-37): free, granted or paid (components/billing/premium-status.tsx).
  const { premium } = await getEntitlement(supabase);
  return {
    premium,
    supabase,
    user,
    profile,
    mfaEnabled,
    recent: isRecentSignIn(claims.amr, Date.now()),
  };
}

// ?export= from GET /account/export (§0.2, D24.19); anything else is ignored.
const exportError = z
  .enum(["rate_limited", "failed"])
  .optional()
  .catch(undefined);

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { user, profile, recent, mfaEnabled, premium, supabase } =
    await loadSettings();
  const exportState = exportError.parse((await searchParams).export);
  const hasPassword = Boolean(profile.password_set_at);
  const sections = [
    { id: "profile", title: "Profile" },
    { id: "birthday", title: "Birthday" },
    { id: "reminders", title: "Reminders" },
    ...(hasPassword ? [{ id: "password", title: "Password" }] : []),
    { id: "two-step", title: "Two-step sign-in" },
    { id: "premium", title: "Premium" },
    { id: "your-data", title: "Your data" },
    { id: "delete-account", title: "Delete account" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 md:grid md:grid-cols-[12rem_1fr] md:gap-10">
      <div>
        <h1 className="headline text-[34px]">Settings</h1>
        <nav
          aria-label="Settings sections"
          className="mt-4 md:sticky md:top-24"
        >
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 font-bold whitespace-nowrap outline-none hover:bg-white/70 dark:hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <SectionIcon id={s.id} />
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mt-8 max-w-3xl space-y-6 md:mt-0">
        <Card id="profile" title="Profile">
          <p className="text-sm text-muted-foreground">Email</p>
          <p className="mb-1 font-medium break-all">{user.email}</p>
          <p className="mb-6 text-sm text-muted-foreground">
            <SupportLinkText text="To change your email, contact support." />
          </p>
          <ProfileForm
            updateDisplayName={updateDisplayName}
            displayName={profile.display_name}
          />
        </Card>
        <Card id="birthday" title="Birthday">
          <BirthdayCard
            updateBirthday={updateBirthday}
            updateTimeZone={updateTimeZone}
            month={profile.birth_month}
            day={profile.birth_day}
            timeZone={profile.time_zone}
            zones={["UTC", ...Intl.supportedValuesOf("timeZone")]}
          />
        </Card>
        <Card id="reminders" title="Reminders">
          {premium ? (
            <RemindersSwitch
              enabled={profile.reminders_enabled}
              setReminders={setReminders}
            />
          ) : (
            <UpgradePrompt supabase={supabase} feature="M-137" />
          )}
        </Card>
        {hasPassword && (
          <Card id="password" title="Password">
            {recent ? (
              <PasswordForm changePassword={changePassword} />
            ) : (
              <ReauthGate />
            )}
          </Card>
        )}
        <Card id="two-step" title="Two-step sign-in">
          {recent ? (
            <TwoStepCard
              enabled={mfaEnabled}
              start={startMfaEnrollment}
              confirm={confirmMfaEnrollment}
              disable={disableMfa}
            />
          ) : (
            <div className="grid gap-4">
              <p>
                {mfaEnabled
                  ? "Two-step sign-in is on. You'll enter a code from your authenticator app when you sign in."
                  : "Two-step sign-in is off. Turn it on to enter a code from an authenticator app each time you sign in."}
              </p>
              <ReauthGate />
            </div>
          )}
        </Card>
        <Card id="premium" title="Premium">
          <PremiumStatus
            supabase={supabase}
            premium={premium}
            timeZone={profile.time_zone}
          />
        </Card>
        <Card id="your-data" title="Your data">
          <p className="mb-4">
            Download a copy of your account details and everything saved in{" "}
            {appConfig.name}, as a JSON file.
          </p>
          {exportState && (
            <Alert variant="destructive" role="alert" className="mb-4">
              <AlertDescription>
                {msg(exportState === "rate_limited" ? "M-5" : "M-25")}
              </AlertDescription>
            </Alert>
          )}
          {/* A plain link, never <Link> (a prefetch would spend the rate limit) and no
              `download` attribute: the route's Content-Disposition makes the file, and its error
              redirects must show the page, not save it (BUILD F-11). */}
          <Button asChild size="lg" variant="outline">
            <a href="/account/export">Download my data</a>
          </Button>
        </Card>
        <Card id="delete-account" title="Delete account" destructive>
          <p className="mb-2">
            This permanently deletes your account and everything in it. It
            can&apos;t be undone. Backup copies are deleted automatically within
            30 days.
          </p>
          <p className="mb-4 text-sm">
            Want a copy first?{" "}
            <a href="#your-data" className="underline underline-offset-4">
              Download your data.
            </a>
          </p>
          {recent ? (
            <DeleteAccountForm
              deleteAccount={deleteAccount}
              email={user.email ?? ""}
            />
          ) : (
            <ReauthGate />
          )}
        </Card>
      </div>
    </div>
  );
}
