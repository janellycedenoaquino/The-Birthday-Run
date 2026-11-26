// Canonical host (decision 0025, BUILD §0.7): page requests that reach the app on a *.vercel.app
// address (the old production URL, which emails sent before go-live still link to) move to the
// site's own host, keeping path and query, so token links and sign-in cookies end up on one origin.
// Only GET/HEAD pages move: /api/* (cron, Stripe webhook, one-click unsubscribe from old emails)
// and form posts keep working where they are. Only *.vercel.app hosts move, so a site URL on the
// bare domain (which Vercel redirects to www) can never cause a loop.
export function canonicalHostRedirect(
  url: URL,
  method: string,
  siteUrl: string | undefined, // required in production (env schema); unset locally: no redirect
): URL | null {
  if (!siteUrl) return null;
  const site = new URL(siteUrl);
  if (!url.hostname.endsWith(".vercel.app") || url.host === site.host)
    return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  // Set the parts one by one: new URL(path, origin) would follow a "//other.host" path off-site.
  const target = new URL(site.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  return target;
}
