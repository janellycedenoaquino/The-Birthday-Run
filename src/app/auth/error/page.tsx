import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";

// S-8 Auth error (SPEC §3.3, BUILD F-7, D24.27): a friendly dead end for failed links and OAuth
// returns. Static texts only: no codes, no Supabase text. Unknown or missing reason → `link`.
export const metadata: Metadata = {
  title: "Something went wrong",
  robots: { index: false },
};

const reasonSchema = z.enum(["link", "oauth", "rate_limited"]).catch("link");

export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const reason = reasonSchema.parse((await searchParams).reason);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      {reason === "rate_limited" && (
        <>
          <h1 className="text-2xl font-semibold">Please wait a moment</h1>
          <p className="mt-2 mb-8">{msg("M-5")}</p>
          <Button asChild size="lg">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </>
      )}
      {reason === "link" && (
        <>
          <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
          <p className="mt-2 mb-8">{msg("M-11")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/forgot-password">Send a new reset link</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-up">Create an account</Link>
            </Button>
          </div>
        </>
      )}
      {reason === "oauth" && (
        <>
          <h1 className="text-2xl font-semibold">Sign-in didn&apos;t finish</h1>
          <p className="mt-2 mb-8">{msg("M-12")}</p>
          <Button asChild size="lg">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </>
      )}
    </div>
  );
}
