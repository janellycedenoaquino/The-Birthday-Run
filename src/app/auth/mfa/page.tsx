import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/mfa-form";
import { appConfig } from "@/config/app";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { signOut } from "@/server/actions/auth";
import { verifyMfaSignIn } from "@/server/actions/mfa";
import { requireUser } from "@/server/auth/guards";

// S-10 Two-step code (SPEC §3.3, BUILD F-10, FR-58). Level `aal1-pending`; anyone already aal2
// or without a verified factor goes straight on to `next`.
export const metadata: Metadata = {
  title: "Enter your code",
  robots: { index: false },
};

export default async function MfaPage({
  searchParams,
}: PageProps<"/auth/mfa">) {
  const { user, claims } = await requireUser({ allowPendingMfa: true });
  const { next } = await searchParams;
  const target = safeRedirectPath(typeof next === "string" ? next : undefined);
  // Any verified factor, exactly like the guard: otherwise a non-TOTP factor would loop between
  // the guard and this page (#19 review). The action then needs a TOTP one.
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  if (claims.aal === "aal2" || !hasFactor) redirect(target);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">Enter your code</h1>
      <p className="mt-2 mb-8">
        Open your authenticator app and enter the 6-digit code for{" "}
        {appConfig.name}.
      </p>
      <MfaForm verify={verifyMfaSignIn} next={target} />
      <p className="mt-8 text-sm">
        Lost your authenticator app? Contact support at{" "}
        <a
          href={`mailto:${appConfig.supportEmail}`}
          className="underline underline-offset-4"
        >
          {appConfig.supportEmail}
        </a>
        .
      </p>
      <form action={signOut} className="mt-4 text-sm">
        <button type="submit" className="underline underline-offset-4">
          Sign out
        </button>
      </form>
    </div>
  );
}
