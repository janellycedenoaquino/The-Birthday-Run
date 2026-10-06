import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";
import { SupportLinkText } from "@/components/layout/support-link-text";
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
import {
  confirmMfaEnrollment,
  disableMfa,
  startMfaEnrollment,
} from "@/server/actions/mfa";
import { isRecentSignIn, requireUser } from "@/server/auth/guards";

// S-13 Settings (SPEC §3.3, BUILD F-11, FR-19): one card per section, each with its own form.
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

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
      className={`scroll-mt-20 rounded-lg border p-6 ${destructive ? "border-destructive/60" : "border-border/70"}`}
    >
      <h2 id={`${id}-title`} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
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
    .select("display_name, password_set_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-13: could not read the profile", {
      cause: error ?? "missing",
    });
  const mfaEnabled = (user.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  return {
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
  const { user, profile, recent, mfaEnabled } = await loadSettings();
  const exportState = exportError.parse((await searchParams).export);
  const hasPassword = Boolean(profile.password_set_at);
  const sections = [
    { id: "profile", title: "Profile" },
    ...(hasPassword ? [{ id: "password", title: "Password" }] : []),
    { id: "two-step", title: "Two-step sign-in" },
    { id: "your-data", title: "Your data" },
    { id: "delete-account", title: "Delete account" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 md:grid md:grid-cols-[12rem_1fr] md:gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <nav
          aria-label="Settings sections"
          className="mt-4 md:sticky md:top-24"
        >
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="underline-offset-4 hover:underline"
                >
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
