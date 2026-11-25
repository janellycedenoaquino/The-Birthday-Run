"use client";

import { useEffect } from "react";

// Radix dialogs lock page scroll with react-remove-scroll, which adds a <style> element. Under the
// strict CSP (D5, BUILD §0.7) an un-nonced <style> is blocked, so the lock's styles never applied
// and each open dialog logged a violation. Its style helper (get-nonce) reads the global
// `__webpack_nonce__`, which the build leaves as a plain global: setting it to this request's
// nonce lets those <style> elements carry it. Set after mount (browser only: on the server a
// global would be shared between requests); no dialog is open before then. The nonce already
// reaches the browser (next-themes gets it too). This depends on the bundler leaving that name
// as a global (Turbopack does); tests/e2e/discover.spec.ts opens a dialog under a CSP watch, so
// a bundler change that breaks it fails there.
export function StyleNonce({ nonce }: { nonce: string }) {
  useEffect(() => {
    (globalThis as { __webpack_nonce__?: string }).__webpack_nonce__ = nonce;
  }, [nonce]);
  return null;
}
