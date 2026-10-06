# 0012. Sentry 11 setup, and our own /monitoring tunnel

Date: 2026-09-29 (drafted overnight 2026-09-28) · Status: accepted

## Context
D1 targets `@sentry/nextjs` 11 (installed: 11.1.0) and BUILD F-4 was written from its release notes before any code. Building #12 against the installed package's own types showed three differences from F-4, and one property of the generated tunnel that F-4 and D24.16 describe differently.

## Decision
- **`sendDefaultPii` no longer exists** in 11 (not in `@sentry/core` 11.1.0's `Options`; typecheck rejects it). `dataCollection` replaced it, so the init sets only `dataCollection`.
- **`dataCollection` also turns off `stackFrameVariables`, `databaseQueryData`, `graphQL`, `genAI` and `queues`.** 11 turns them on by default; stack-frame local variables could hold a password. The scrubber also deletes frame `vars`, as a second line.
- **`withSentryConfig` moved to `@sentry/nextjs/config`.** Importing it from the root made `next typegen` fail with "withSentryConfig is not a function". This is an import-path change, not a build break, so D1's fallback to 10.75.x isn't used.
- The build plugin's usage telemetry is off (`telemetry: false`); the router-transition warning is suppressed because that hook only feeds tracing, which is off (D15).
- The one options object lives in `src/lib/observability/sentry-options.ts` and is checked with `satisfies` against `Sentry.init`'s parameter type, so a mistyped or removed key fails typecheck instead of being silently ignored (checked: adding `sendDefaultPii` fails it).
- `logError` tags events with `op` only; a user ID never goes to Sentry (D15 drops `user`), only into the server console line.

## The tunnel (D24.16): our own route handler (user, 2026-09-29)
`tunnelRoute: '/monitoring'` builds a Next **rewrite** to `https://o<orgid>.ingest[.<region>].sentry.io/api/<projectid>/envelope/`, with the numeric org and project IDs taken from the request's query string. So it relays to **any** project on sentry.io, not "only to the configured DSN" as D24.16 says. It can't reach another host, so it isn't SSRF, but anyone could use each app's domain as a free relay to their own Sentry project, on the app's Vercel bandwidth.
- **Chosen:** no `tunnelRoute`. `/monitoring` is our own `POST` route handler (`src/app/monitoring/route.ts` → `tunnelEnvelope` in `src/server/observability/sentry-tunnel.ts`). It forwards an envelope only when the DSN in its header matches `NEXT_PUBLIC_SENTRY_DSN` (host, key and project), always to the URL built from our DSN, body only (no cookies, headers or visitor IP), up to 1 MiB, never following redirects, and relays Sentry's rate-limit headers so the SDK backs off. Details: BUILD F-4.
- That makes D24.16's "forwards only to the DSN" true as written, so D24.16 isn't changed. Its no-rate-limit exception stays: our own DSN is public, so a flood of our own project's events is still possible and still covered by spike protection and the plan cap.
- Not taken: keep the generated rewrite and reword D24.16 (every app would ship an open relay).

## Hardening from the second-opinion review (2026-09-29)
- The proxy's `getClaims` outage error goes to Sentry at most every 5 minutes per instance (`logError`'s `sentryEveryMs`), so an outage can't use up the free plan's monthly error quota.
- No `tracesSampleRate` at all: Sentry treats even `0` as tracing on.
- The scrubber also catches JSON, `key: value` and percent-encoded secrets, more secret key names, emails used as keys, URL paths, thread frame `vars`, `mechanism.data`, and the separate `query`/`fragment` breadcrumb fields (BUILD F-4).
- The tunnel releases Sentry's response body and guards the status; `safeRedirectPath` refuses a value still encoded after its three decode rounds.
- Zod runs `jitless` (set in `src/lib/env/public-schema.ts`): with Sentry's options reading `publicEnv`, Zod reaches the browser and probes `Function("")`, which the CSP blocks (NFR-13). Zod reads the setting when a schema is built, so it holds only while that module loads before any other client-side schema (today it's first, through `instrumentation-client.ts`). The e2e no-violations check catches a change in that order.

## Alternatives
- Sentry 10.75.x (D1 fallback): not needed; 11.1.0 builds and typechecks.
- Keep `sendDefaultPii: false` for readability: fails typecheck on 11.

## Consequences
BUILD F-4 (Sentry setup, scrubber, tunnel), §0.1 and §0.8 are updated. Manual follow-up for the throwaway-app check (FR-31, NFR-17): consider turning on Sentry's project setting "Prevent Storing of IP Addresses", for server-side events (the tunnel itself forwards no visitor IP; Sentry sees the server's). Not verified: needs a real DSN.
