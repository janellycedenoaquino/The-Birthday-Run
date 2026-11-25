import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { SignInForms } from "@/components/auth/sign-in-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { msg } from "@/lib/messages";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import {
  requestMagicLink,
  signIn,
  signInWithGoogle,
} from "@/server/actions/auth";
import { getShowcase, shuffle } from "@/server/catalog/showcase";
import { createClient } from "@/server/supabase/server";

// S-4 Sign in (SPEC §3.3, BUILD F-7, FR-3..FR-5, FR-18). Public; signed-in users go on. Look:
// decision 0016 (AuthShell; its "Create account" tab replaces the "New here?" link).
export const metadata: Metadata = { title: "Sign in" };

const errorSchema = z.enum(["oauth_cancelled"]).optional().catch(undefined);

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next =
    typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;

  const error = errorSchema.parse(params.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Signed in: the dashboard (FR-18) - except a cancelled Google re-auth (the only way a signed-in
  // user comes back here with an error), which returns to S-11 to try again (#14 review).
  if (user)
    redirect(
      error === "oauth_cancelled"
        ? "/auth/reauthenticate?next=%2Fsettings"
        : "/rewards",
    );

  const nonce = (await headers()).get("x-nonce") ?? "";
  const { withLogos } = await getShowcase(supabase);

  return (
    <AuthShell mode="in" next={next} retailers={shuffle(withLogos)}>
      {error === "oauth_cancelled" && (
        <Alert className="mb-6">
          <AlertDescription>{msg("M-9")}</AlertDescription>
        </Alert>
      )}
      <GoogleButton signInWithGoogle={signInWithGoogle} next={next} />
      <div
        className="my-6 flex items-center gap-3 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <SignInForms
        signIn={signIn}
        requestMagicLink={requestMagicLink}
        next={next}
        nonce={nonce}
      />
    </AuthShell>
  );
}
