import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { updatePasswordFromReset } from "@/server/actions/auth";
import { requireUser } from "@/server/auth/guards";
import { isRecoverySessionNow } from "@/server/auth/recovery";

// S-7 Reset password (SPEC §3.3, BUILD F-8, FR-8). Level `recovery`: a reset link's session
// (MFA users pass S-10 first, D24.5). Without one, S-8's "link" content and a new-link button.
export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
};

export default async function ResetPasswordPage() {
  const { user, claims } = await requireUser({ allowPendingPassword: true });
  const allowed = await isRecoverySessionNow(user.id, claims);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      {allowed ? (
        <>
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
          <p className="mt-2 mb-8">
            For <span className="font-medium break-all">{user.email}</span>
          </p>
          <ResetPasswordForm updatePassword={updatePasswordFromReset} />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
          <p className="mt-2 mb-8">{msg("M-11")}</p>
          <Button asChild size="lg">
            <Link href="/forgot-password">Send a new reset link</Link>
          </Button>
        </>
      )}
    </div>
  );
}
