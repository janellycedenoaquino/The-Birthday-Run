"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { SupportLinkText } from "@/components/layout/support-link-text";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";

// S-20 (SPEC §3.3, FR-23, NFR-9): inside the root layout. Never the error's message, digest or a
// Sentry id; the details go to Sentry (D15).
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 mb-8">
        <SupportLinkText text={msg("M-39")} />
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
