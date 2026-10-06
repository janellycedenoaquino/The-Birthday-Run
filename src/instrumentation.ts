import * as Sentry from "@sentry/nextjs";

// Server-side Sentry per runtime (BUILD F-4, D15; Next's instrumentation.ts convention).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs")
    await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge")
    await import("../sentry.edge.config");
}

// Errors Next catches in server components, route handlers, actions and the proxy.
export const onRequestError = Sentry.captureRequestError;
