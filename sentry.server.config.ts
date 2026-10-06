import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./src/lib/observability/sentry-options";

// Node.js runtime Sentry (BUILD F-4, D15); loaded by src/instrumentation.ts.
Sentry.init(sentryOptions);
