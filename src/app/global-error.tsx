"use client";

import Link from "next/link";
import {
  useReportError,
  type ErrorPageProps,
} from "@/components/layout/report-error";
import { SupportLinkText } from "@/components/layout/support-link-text";
import { msg } from "@/lib/messages";
import "./globals.css";

// S-20 (FR-23) for errors in the root layout itself: its own minimal document, no header. Never
// shows the error's message, digest or a Sentry ID (NFR-9); the details go to Sentry (D15).
export default function GlobalError({ error, retry }: ErrorPageProps) {
  useReportError(error);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p>
            <SupportLinkText text={msg("M-39")} />
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-md border px-4 py-2"
            >
              Try again
            </button>
            <Link href="/" className="rounded-md border px-4 py-2">
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
