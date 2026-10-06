import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { setInitialPassword, signOut } from "@/server/actions/auth";
import { requireUser } from "@/server/auth/guards";

// S-9 Set password (SPEC §3.3, BUILD F-6, FR-1, FR-2, D10, D24.1). Level `password-unset`:
// verified, email-only, no password yet. Everyone else goes to the dashboard.
export const metadata: Metadata = {
  title: "Choose a password",
  robots: { index: false },
};

export default async function SetPasswordPage({
  searchParams,
}: PageProps<"/auth/set-password">) {
  const { supabase, user } = await requireUser({ allowPendingPassword: true });
  const emailOnly = (user.identities ?? []).every(
    (identity) => identity.provider === "email",
  );
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("password_set_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile)
    throw new Error("S-9: could not read the profile", {
      cause: error ?? "profile row missing",
    });
  if (profile.password_set_at || !emailOnly) redirect("/dashboard");

  const { next } = await searchParams;
  const target = safeRedirectPath(
    typeof next === "string" ? next : undefined,
    "/dashboard",
  );

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <p className="text-sm text-muted-foreground">Step 2 of 2</p>
      <h1 className="mt-1 text-2xl font-semibold">Choose a password</h1>
      <p className="mt-2 mb-8">
        Your email <span className="font-medium break-all">{user.email}</span>{" "}
        is confirmed. Choose a password to finish setting up your account.
      </p>
      <SetPasswordForm setInitialPassword={setInitialPassword} next={target} />
      <form action={signOut} className="mt-8 text-sm">
        Not you?{" "}
        <button type="submit" className="underline underline-offset-4">
          Sign out
        </button>
      </form>
    </div>
  );
}
