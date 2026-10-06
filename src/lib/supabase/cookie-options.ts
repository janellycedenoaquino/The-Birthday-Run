// Session cookie flags (BUILD §0.7, D21, CLAUDE.md rule 17). @supabase/ssr's defaults aren't
// HttpOnly, so every Supabase server client (the proxy and createClient()) forces these.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `Secure` everywhere except an `http:` site URL on a non-local host. Chromium treats localhost
 * as a secure context, so local http development still gets `Secure` cookies.
 */
export function isSecureCookie(siteUrl: string | undefined): boolean {
  if (!siteUrl) return true;
  const url = new URL(siteUrl);
  return url.protocol === "https:" || LOCAL_HOSTS.has(url.hostname);
}

export function sessionCookieOptions(siteUrl: string | undefined) {
  return {
    httpOnly: true,
    secure: isSecureCookie(siteUrl),
    sameSite: "lax",
    path: "/",
  } as const;
}
