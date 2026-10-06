import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleButton } from "@/components/auth/google-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { signInWithGoogle, signUp } from "@/server/actions/auth";
import { createClient } from "@/server/supabase/server";

// S-5 Sign up (SPEC §3.3, BUILD F-6, FR-1, FR-18). Public; a signed-in user goes to the dashboard.
export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const nonce = (await headers()).get("x-nonce") ?? "";
  // S-4 passes `next` on; the email flow doesn't carry one (D10), Google does (#14 review).
  const { next } = await searchParams;
  const target = typeof next === "string" ? safeRedirectPath(next) : undefined;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
      <GoogleButton signInWithGoogle={signInWithGoogle} next={target} />
      <div
        className="my-6 flex items-center gap-3 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <SignUpForm signUp={signUp} nonce={nonce} />
      <p className="mt-8 text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
