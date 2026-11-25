"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// S-20's shared parts (FR-23, NFR-9, D15) for app/error.tsx and app/global-error.tsx: the props
// Next passes and the Sentry report. The page never shows the error's message, digest or ID.
export type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export function useReportError(error: Error) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
}
