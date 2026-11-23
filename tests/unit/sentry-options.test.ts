import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/observability/scrub";
import { sentryOptions } from "@/lib/observability/sentry-options";

// Sentry options (BUILD F-4, D15, rule 20; decisions/0005): errors only, and every event type
// Sentry could send passes through the scrubber.

describe("sentryOptions", () => {
  it("records no spans: no tracesSampleRate or tracesSampler, not even 0 (D15)", () => {
    expect(sentryOptions).not.toHaveProperty("tracesSampleRate");
    expect(sentryOptions).not.toHaveProperty("tracesSampler");
  });

  it("uses the static trace lifecycle, so beforeSendTransaction is honoured (decisions/0005)", () => {
    expect(sentryOptions.traceLifecycle).toBe("static");
    expect(sentryOptions.beforeSendTransaction).toBe(scrubEvent);
    expect(sentryOptions.beforeSend).toBe(scrubEvent);
  });
});
