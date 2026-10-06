# 0010. The nonce CSP ships with a dynamic root layout (week-1 check 1, partial)

Date: 2026-09-28 · Status: accepted

## Context
#8 adds the proxy's per-request nonce CSP (D5, BUILD F-2). BUILD left the root layout's use of `x-nonce` to F-3 (#9). Testing #8's production build showed that without it the home page is prerendered (`x-nextjs-prerender: 1`): none of its 8 scripts carry a nonce, so under `script-src 'nonce-…' 'strict-dynamic'` a browser would block all of them and no page would hydrate. CI wouldn't notice (no e2e yet). Week-1 check 1 asks whether the nonce CSP works with Sonner, `next/font` and next-themes.

## Decision
- The layout's first F-3 step ships with #8: `(await headers()).get('x-nonce')`, throwing if missing, except on router prefetches (`next-router-prefetch` or `Purpose: prefetch`), which the proxy's matcher skips by design (Next's CSP guide); they return RSC data, not an HTML document the CSP would apply to. That makes every page render per request, and Next puts the nonce on its scripts. F-3 keeps the rest (passing the nonce to next-themes, the Turnstile loader and the brand `<style>`).
- Week-1 check 1, measured on `next build` + `next start` with the CI env: all 8 scripts on `/` (2 inline, 6 external) carry that request's nonce; the page is no longer prerendered; the 404 page is also dynamic. **`next/font` needs no exception**: it emits one same-origin stylesheet and no inline `<style>`, and its font files are self-hosted (`font-src 'self'`). `STYLE_POLICY` stays `'split'`.
- Sonner and next-themes are installed but not used until F-3 (#9), so their part of check 1 moves there: #9 records it, and switches to the `'unsafe-inline'` style fallback with a new decision only if they fail.

## Alternatives
- Leave the layout to #9: `main` would serve pages whose scripts the CSP blocks, from the moment #8 merges until #9 does.
- `export const dynamic = 'force-dynamic'`: also dynamic, but doesn't check that the proxy ran; the throw catches a matcher change that skips the proxy (BUILD F-3 edge case).

## Consequences
Every page is dynamic from #8 on (as D5 already expected). #9 edits the same layout, so merging #8 and #9 may need a small conflict resolution in `src/app/layout.tsx`. The e2e step (0 CSP console violations, BUILD F-2 tests) will cover this in a real browser once it exists.
