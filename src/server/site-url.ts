import "server-only";
import { env } from "@/server/env";

// The site's canonical URL (BUILD F-3 "Site URL", D24.23): NEXT_PUBLIC_SITE_URL, else the branch
// URL on a Vercel Preview, else an error (never a guess). Always an origin without a trailing
// slash (the env schema checks the first; the second is Vercel's host). Client components get
// absolute URLs as props.
export function getSiteUrl(
  vercel: { env?: string; branchUrl?: string } = {
    env: process.env.VERCEL_ENV,
    branchUrl: process.env.VERCEL_BRANCH_URL,
  },
): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL;
  if (vercel.env === "preview" && vercel.branchUrl)
    return `https://${vercel.branchUrl.replace(/\/+$/, "")}`;
  throw new Error(
    "getSiteUrl: set NEXT_PUBLIC_SITE_URL (required outside Vercel Preview)",
  );
}
