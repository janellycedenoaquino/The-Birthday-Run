import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { requestPasswordReset } from "@/server/actions/auth";

// S-6 Forgot password (SPEC §3.3, BUILD F-8, FR-7). Anyone, signed-in users too (SPEC §3.8).
export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-2 mb-8">
        Enter the email you sign in with and we&apos;ll send you a link to
        choose a new password.
      </p>
      <ForgotPasswordForm
        requestPasswordReset={requestPasswordReset}
        nonce={nonce}
      />
      <p className="mt-8 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
