import { defineConfig, devices } from "@playwright/test";

import { e2eEnvSchema, formatEnvError } from "./src/lib/env/schema";

// E2E (D18, BUILD "Test suites"): against `next build` + `next start`, so the nonce CSP is the
// production one. Run `npm run build` first; needs local Supabase (limiter reset, Mailpit).
// E2E_TARGET=deployed runs only the journey against the deployed site (NEXT_PUBLIC_SITE_URL),
// signing up E2E_EMAIL, with links pasted by hand (tests/e2e/support.ts).
const parsed = e2eEnvSchema.safeParse(process.env);
if (!parsed.success) throw new Error(formatEnvError(parsed.error));
const deployed = parsed.data.E2E_TARGET === "deployed";
const PORT = 3100;
const baseURL = deployed
  ? process.env.NEXT_PUBLIC_SITE_URL
  : `http://localhost:${PORT}`;
if (!baseURL) throw new Error("E2E_TARGET=deployed needs NEXT_PUBLIC_SITE_URL");

export default defineConfig({
  testDir: "tests/e2e",
  // A deployed run has no local database to reset and only runs the journey.
  ...(deployed
    ? { testMatch: "journey.spec.ts" }
    : { globalSetup: "./tests/e2e/global-setup.ts" }),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: deployed
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
