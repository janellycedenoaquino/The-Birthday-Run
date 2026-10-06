import "server-only";

// The Content-Security-Policy for one request (BUILD F-2, D5, NFR-13). The proxy builds it with a
// fresh nonce per request and sets it on both the request (Next reads the nonce from it) and the
// response.

// Changing STYLE_POLICY needs a decisions/ entry (D5 fallback). Script rules never depend on it.
export const STYLE_POLICY: "split" | "unsafe-inline" = "split";

// Sonner 2.x inserts its stylesheet as an un-nonced <style> when it loads, first empty, then
// filled (week-1 check 1, decision 0011). The split policy allows exactly those two contents by
// hash, never other inline styles. tests/unit/csp.test.ts recomputes the hash from the installed
// sonner, so an upgrade that changes the stylesheet fails the unit suite until this is updated.
export const SONNER_STYLE_HASH =
  "sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=";
export const EMPTY_STYLE_HASH =
  "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

export function buildCsp({
  nonce,
  dev,
  supabaseUrl,
  stylePolicy = STYLE_POLICY,
}: {
  nonce: string;
  dev: boolean;
  supabaseUrl: string;
  /** Only for tests of both policies; the app always uses STYLE_POLICY. */
  stylePolicy?: typeof STYLE_POLICY;
}): string {
  const supabase = new URL(supabaseUrl).origin;
  const styles =
    stylePolicy === "split"
      ? [
          `style-src-elem 'self' 'nonce-${nonce}' '${SONNER_STYLE_HASH}' '${EMPTY_STYLE_HASH}'`,
          `style-src-attr 'unsafe-inline'`,
        ]
      : [`style-src 'self' 'unsafe-inline'`];
  return [
    `default-src 'self'`,
    // The Cloudflare host is the CSP2 fallback for Turnstile; 'unsafe-eval' is for React in dev.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    ...styles,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-src https://challenges.cloudflare.com`,
    // Chrome applies form-action to redirects after a form POST (the Google button before
    // hydration), so Supabase and Google are listed.
    `form-action 'self' ${supabase} https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

/** A fresh, unguessable nonce per request (base64 of a random UUID). */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
