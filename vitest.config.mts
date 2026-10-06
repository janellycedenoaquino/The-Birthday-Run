import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const alias = {
  "@": path("./src"),
  // `server-only` throws outside Next's server build; tests import server modules directly.
  "server-only": path("./tests/server-only-stub.ts"),
};

// Placeholder values for unit tests (never real keys): server modules parse the environment when
// they load, so importing one (e.g. src/server/actions/auth.ts) must work on a clean checkout.
// Tests that care about a value mock @/server/env themselves.
const unitEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit-test-placeholder",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "unit-test-placeholder",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  SUPABASE_SECRET_KEY: "sb_secret_unit-test-placeholder",
  RATE_LIMIT_HMAC_SECRET: "unit-test-placeholder-at-least-32-chars",
  EMAIL_TRANSPORT: "mailpit",
  EMAIL_FROM: "Test <test@example.com>",
  MAILPIT_URL: "http://127.0.0.1:54324",
};

// Two projects (D18): `npm test` runs unit, `npm run test:rls` runs rls against local Supabase.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: unitEnv,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "rls",
          include: ["tests/rls/**/*.test.ts"],
          environment: "node",
          // One shared local database: run files one at a time (BUILD F-1 "Tests").
          fileParallelism: false,
          globalSetup: ["tests/rls/global-setup.ts"],
          setupFiles: ["tests/rls/load-env.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
