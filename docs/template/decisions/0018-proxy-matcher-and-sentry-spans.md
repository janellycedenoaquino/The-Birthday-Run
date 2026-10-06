# 0018. Proxy matcher excludes exact paths only; Sentry's transaction scrubber stays

Date: 2026-09-30 · Status: accepted

## Context
Two things the second sign-off run (decision 0016) showed on the deployed app:
- Every request for `/favicon.ico` logged `x-nonce missing: the proxy didn't run for this request`. There is no `favicon.ico` (`src/app/icon.tsx` serves `/icon/<size>`), so the request renders the 404 page inside the root layout, and the proxy matcher skipped it, so the layout had no nonce and threw (BUILD F-2). The matcher's exclusions were prefixes, so anything starting with one did the same: `/iconography`, `/monitoring-status`, `/robots.txt.bak`, and, as the fresh-eyes review of the first fix showed, anything *under* an excluded path (`/monitoring/x`, `/apple-icon/x`, `/_next/image/x`) and look-alikes the unescaped dots matched (`/robotsXtxt`). Each of those is a 500 with no CSP, and a Sentry event anyone can trigger.
- The browser console showed Sentry 11's warning that `beforeSendTransaction` is ignored with its default `traceLifecycle: 'stream'`.

## Decision
- The matcher excludes **exact paths**, dots escaped: `/_next/image`, `/monitoring`, `/apple-icon`, `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`. Only two prefixes stay, `/_next/static/` and `/icon/`, because Next answers unknown paths under them with its own plain 404, never the layout. `favicon.ico` is no longer excluded. Everything else runs the proxy, and a 404 gets its nonce like any page. `tests/unit/proxy.test.ts` lists both sets with Next's `unstable_doesMiddlewareMatch` (Next 16's docs call it `unstable_doesProxyMatch`, which this version doesn't export).
- Checked on a local production build: `/favicon.ico`, `/icon`, `/iconography`, `/monitoring/x`, `/monitoring-status`, `/apple-icon/x`, `/opengraph-image/x`, `/robots.txt/x`, `/robotsXtxt`, `/sitemap-xml` and `/_next/image/x` are 404s with a CSP; `/icon/32`, `/apple-icon`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` and `/opengraph-image` are 200s without the proxy; `/icon/x` and `/_next/static/x` are Next's plain 404s. No `x-nonce missing` in the server log.
- `beforeSendTransaction: scrubEvent` **stays**, despite the warning. Sentry still calls it for any transaction event that is sent (`@sentry/core` `processBeforeSend`); the warning only means streamed spans skip it. The Template sends no spans (no `tracesSampleRate`, D15). An app that turns tracing on adds a `beforeSendSpan` scrubber first. The console warning is expected.

## Alternatives
- Add a `favicon.ico` file: fixes one path, not the prefix problem, and every app would need to replace another brand file.
- Remove `beforeSendTransaction` to silence the warning (the first version of this fix): leaves any transaction event unscrubbed (NFR-17).

## Consequences
- A browser's `/favicon.ico` request now runs the proxy and renders the 404 page: for a signed-in visitor that's a session check (which may refresh the cookie) and the layout's account lookup, the same as any page. Browsers mostly use the `<link rel="icon">` instead.
- A new static route the proxy should skip is added as one exact path, dots escaped, with a test case for it and for a path under it.
- Not changed here: a request with a `Purpose: prefetch` or `next-router-prefetch` header skips the proxy and renders without a CSP, as the Next CSP guide's `missing` rule intends (decision 0010). The fresh-eyes review flagged it; it's the same as before this change.
