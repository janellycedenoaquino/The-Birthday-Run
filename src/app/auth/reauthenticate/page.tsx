import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { GoogleButton } from "@/components/auth/google-button";
import { ReauthForm } from "@/components/auth/reauth-form";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import {
  reauthenticateWithPassword,
  signInWithGoogle,
} from "@/server/actions/auth";
import { requireUser } from "@/server/auth/guards";

// S-11 Confirm it's you (SPEC §3.3, BUILD F-9, FR-56, D9). Level `user`: signed in, not
// necessarily recently (that's why the user is here).
export const metadata: Metadata = {
  title: "Confirm it's you",
  robots: { index: false },
};

export default async function ReauthenticatePage({
  searchParams,
}: PageProps<"/auth/reauthenticate">) {
  const { supabase, user } = await requireUser();
  const nonce = (await headers()).get("x-nonce") ?? "";
  const { next } = await searchParams;
  const target = safeRedirectPath(
    typeof next === "string" ? next : undefined,
    "/settings",
  );

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("password_set_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-11: could not read the profile", {
      cause: error ?? "profile row missing",
    });
  // Google-only accounts (no password, D24.1) confirm with Google: a fresh OAuth round-trip.
  const hasPassword = Boolean(profile.password_set_at);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">Confirm it&apos;s you</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        For your security, sign in again before making this change.
      </p>
      {hasPassword ? (
        <ReauthForm
          reauthenticate={reauthenticateWithPassword}
          email={user.email ?? ""}
          next={target}
          nonce={nonce}
        />
      ) : (
        <div className="grid gap-4">
          <GoogleButton signInWithGoogle={signInWithGoogle} next={target} />
          <p className="text-sm text-muted-foreground">
            You&apos;ll be sent to Google and straight back.
          </p>
          <div>
            <Button asChild variant="ghost" size="lg">
              <Link href="/settings">Cancel</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
