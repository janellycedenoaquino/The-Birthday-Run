// Sentry 11 moved the build wrapper to its own entry point (no longer exported from the root).
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { formatEnvError, serverEnvSchema } from "./src/lib/env/schema";
import { SECURITY_HEADERS } from "./src/lib/security/headers";

// Fail the build (and dev) early when env vars are missing, naming variables only (FR-52, D6).
const env = serverEnvSchema.safeParse(process.env);
if (!env.success) throw new Error(formatEnvError(env.error));

const nextConfig: NextConfig = {
  poweredByHeader: false, // no "x-powered-by: Next.js" (securityheaders.com note, sign-off)
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

// Sentry build setup (BUILD F-4, D15). No `tunnelRoute`: its generated rewrite relays to any
// sentry.io project, so /monitoring is our own route handler instead (decisions/0012). Source maps
// are uploaded, then deleted from the build, only when SENTRY_AUTH_TOKEN is set (Vercel).
const uploadSourceMaps = Boolean(env.data.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: env.data.SENTRY_ORG,
  project: env.data.SENTRY_PROJECT,
  authToken: env.data.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !uploadSourceMaps,
    deleteSourcemapsAfterUpload: true,
  },
  telemetry: false, // the build plugin would otherwise report usage to Sentry
  silent: !process.env.CI,
  // That hook only feeds tracing, which is off (D15).
  suppressOnRouterTransitionStartWarning: true,
});
