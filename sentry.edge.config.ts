import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./src/lib/observability/sentry-options";

// Edge runtime Sentry (BUILD F-4, D15); loaded by src/instrumentation.ts. The proxy runs on
// Node.js in Next 16, so this only matters if an app adds an edge route.
Sentry.init(sentryOptions);
