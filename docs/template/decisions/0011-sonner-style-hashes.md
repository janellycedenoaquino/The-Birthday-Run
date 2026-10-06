# 0011. Sonner's stylesheet is allowed by exact hash (week-1 check 1, finished)

Date: 2026-09-29 · Status: accepted

## Context
D5's split style rule lets `<style>` elements in only with the request's nonce. Week-1 check 1 (BUILD CI) asks whether Sonner, `next/font` and next-themes work with that; decision 0010 settled `next/font` and moved the rest to #9. In `next build` + `next start` with a real browser, Sonner 2.0.8 inserts its own 15 KB stylesheet from JavaScript when it loads: a `<style>` without a nonce, created empty and then filled. Sonner has no nonce option and no way to skip the insertion, so under the split rule every toast would be unstyled and the console would show a violation.

## Decision
- `style-src-elem` also allows exactly two contents by SHA-256 hash: Sonner's stylesheet and the empty string (`SONNER_STYLE_HASH`, `EMPTY_STYLE_HASH` in `src/server/security/csp.ts`). Only those exact bytes get in; any other un-nonced `<style>` is still blocked. `STYLE_POLICY` stays `'split'`, and D5's `'unsafe-inline'` fallback isn't needed.
- `tests/unit/csp.test.ts` recomputes the hash from the installed `sonner/dist` files, so a Sonner upgrade that changes the stylesheet fails the unit suite until the constant is updated (DESIGN D1 pins `sonner` 2.0.8; Dependabot bumps show up as that failure).
- next-themes passes: its no-flash script carries the request's nonce, it adds no `<style>` (the Template doesn't use `disableTransitionOnChange`), and the theme class is set in both colour schemes.
- Measured with `tests/e2e/shell.spec.ts` on 2026-09-29: 0 CSP violations on `/` in light and dark, Sonner's un-nonced stylesheet present and its rules applied, every server-sent `<script>`/`<style>` on `/` carrying the nonce.

## Alternatives
- D5's fallback, `style-src 'self' 'unsafe-inline'`: allows any inline style, a much wider loosening than two fixed hashes.
- Copy Sonner's CSS into our own stylesheet: Sonner still inserts its copy, so the violation stays.
- Drop Sonner for our own toasts: more code to own (FR-22) for no security gain over a pinned hash.

## Consequences
BUILD F-2 "CSP builder" shows the hashes. Upgrading Sonner means recomputing the hash (the failing test prints the expected value). Next's built-in 404 page has an un-nonced `<style>` as well; S-19 (`not-found.tsx`, #10) replaces it, and the e2e `/no-such-page` nonce check is marked `fixme` until then.
