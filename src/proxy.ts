import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env/public";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { logError } from "@/server/errors";
import { buildCsp, newNonce } from "@/server/security/csp";

// The proxy (BUILD F-2, D2): a fresh CSP nonce per request, session refresh, and an optimistic
// sign-in redirect. It is never the security check: every protected page and action calls its
// own guard (CLAUDE.md rule 3).

// /account/export isn't here: its route handler redirects signed-out callers itself, back to
// /settings rather than to the download (BUILD F-11, D24.19).
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/auth/set-password",
  "/auth/reauthenticate",
  "/auth/mfa",
];

const isProtected = (pathname: string) =>
  PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  });
  const { pathname, search } = request.nextUrl;

  // Overwrite, never trust, what the client sent in these headers.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-pathname", pathname + search);
  headers.set("content-security-policy", csp);

  const cookieOptions = sessionCookieOptions(publicEnv.NEXT_PUBLIC_SITE_URL);
  let cookiesSet = false;
  let supabaseCacheHeaders: Record<string, string> = {};
  let response = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          // Supabase's documented pattern: update the request, then rebuild the response.
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          // request.cookies.set rewrites the request's own cookie header, not the copy this proxy
          // forwards: copy it over, or the page would still see the old (expired) session.
          headers.set("cookie", request.headers.get("cookie") ?? "");
          response = NextResponse.next({ request: { headers } });
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, { ...options, ...cookieOptions });
          for (const [key, value] of Object.entries(cacheHeaders))
            response.headers.set(key, value);
          supabaseCacheHeaders = cacheHeaders;
          cookiesSet = true;
        },
      },
    },
  );

  // Auth unreachable (thrown, or returned as a retryable fetch error): let the request through;
  // the page guard fails closed (BUILD F-2). Only a definite "no session" redirects.
  let signedOut = false;
  try {
    // Verifies the JWT and refreshes an expired session (FR-10).
    const { data, error } = await supabase.auth.getClaims();
    if (error && isAuthRetryableFetchError(error)) logAuthUnreachable(error);
    else signedOut = !data?.claims;
  } catch (error) {
    logAuthUnreachable(error);
  }

  const redirecting = signedOut && isProtected(pathname);
  if (redirecting) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(signIn, 302);
    // Keep any cookie changes (e.g. a cleared session) on the redirect too.
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    for (const [key, value] of Object.entries(supabaseCacheHeaders))
      redirect.headers.set(key, value);
    response = redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  if (cookiesSet || redirecting)
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// An outage fails every request, so Sentry gets it at most every 5 minutes per instance (the free
// plan's monthly quota); the server log still gets every one.
const logAuthUnreachable = (error: unknown) =>
  logError(error, { op: "proxy.getClaims", sentryEveryMs: 5 * 60_000 });

// These paths skip the proxy, so they get no nonce; anything rendering the root layout without one
// throws (BUILD F-2, F-3). So each exclusion is one exact path (dots escaped), and only /icon/<size>
// and /_next/static/ are prefixes: their unknown paths get Next's plain 404, not the layout. Anything
// else, e.g. /iconography, /monitoring/x or /favicon.ico (no such file: src/app/icon.tsx is the
// icon), runs the proxy and renders the 404 page with its nonce (decision 0018).
export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static/|icon/|(?:_next/image|monitoring|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|opengraph-image)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
