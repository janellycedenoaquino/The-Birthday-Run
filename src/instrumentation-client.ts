import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentry-options";

// Browser Sentry (BUILD F-4, D15). Events go to the same-origin /monitoring route, which forwards
// them to our own project only (src/app/monitoring/route.ts, decisions/0012).
Sentry.init({ ...sentryOptions, tunnel: "/monitoring" });
