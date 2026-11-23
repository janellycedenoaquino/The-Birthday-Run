# 0005. Sentry `traceLifecycle: "static"`

Date: 2026-11-22 · Status: accepted · Builds on Template decisions/0018

## Context
On the first production deploy, Vercel's logs showed this line on every request:

> [Sentry] `beforeSendTransaction` and `ignoreTransactions` are ignored with `traceLifecycle: 'stream'` (enabled by default). Use `beforeSendSpan` and `ignoreSpans` instead, or set `traceLifecycle: 'static'`.

Template decisions/0018 kept `beforeSendTransaction: scrubEvent` and accepted the warning as expected, because the app sends no spans (no `tracesSampleRate`, D15; `hasSpansEnabled` in `@sentry/core` 11.12 checks `tracesSampleRate != null || tracesSampler`). So no personal data was leaking. But the warning buried the one real error line during setup (`[rateLimit.signInWithGoogle] … PGRST202`), and with streamed spans the scrubber would be skipped for anything Sentry does send as a transaction.

## Decision
Set `traceLifecycle: "static"` in `src/lib/observability/sentry-options.ts` (browser, server and edge share it). With static, Sentry sends any transaction as one event that passes through `beforeSendTransaction`, so the scrubber applies, and `maybeWarnAboutIgnoredTransactionOptions` no longer warns.

## Alternatives
- Keep the warning (decisions/0018): no leak today, but every request adds a log line that hides real errors.
- Remove `beforeSendTransaction`: silences the warning but leaves any transaction unscrubbed (NFR-17).
- Add a `beforeSendSpan` scrubber and stay on streaming: needed only if tracing is turned on; more code for no current benefit.

## Consequences
- Logs show only real problems. No change in what reaches Sentry while tracing stays off.
- If tracing is ever turned on, transactions are scrubbed by the existing `scrubEvent`; check span attributes too before enabling it.
- Worth taking back to the Template (CLAUDE.md, "Apps made from this template").
