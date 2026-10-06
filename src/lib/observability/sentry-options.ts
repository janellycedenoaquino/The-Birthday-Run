import type { init } from "@sentry/nextjs";
import { publicEnv } from "@/lib/env/public";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

// The one set of Sentry.init options for the browser, server and edge (BUILD F-4, D15).
// Errors only; personal data off explicitly, because Sentry 11 collects it by default.
// Sentry 11 has no `sendDefaultPii` any more: `dataCollection` replaced it.
export const sentryOptions = {
  dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN, // empty → Sentry off (local, CI)
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    // Also on by default in 11; local variables could hold a password.
    stackFrameVariables: false,
    databaseQueryData: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    queues: false,
  },
  // No tracesSampleRate at all: even 0 switches span recording on (Sentry checks `!= null`).
  // Errors only (D15), no Replay integration. Sentry 11 warns in the console that
  // beforeSendTransaction is ignored with streamed spans, but it still runs on any transaction event
  // that does get sent, so it stays. Turning tracing on means adding a `beforeSendSpan` scrubber
  // first (decisions/0018).
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
} satisfies Parameters<typeof init>[0]; // a mistyped key fails typecheck instead of being ignored
