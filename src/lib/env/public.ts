import { formatEnvError, publicEnvSchema } from "./public-schema";

// Each NEXT_PUBLIC_* is referenced literally so Next inlines it into the browser bundle (D6).
// VERCEL_ENV isn't NEXT_PUBLIC_ (undefined in the browser), so it stays out: the production-only
// rules are enforced at build by next.config.ts, and server and browser see the same values.
const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
if (!parsed.success) throw new Error(formatEnvError(parsed.error));

export const publicEnv = Object.freeze(parsed.data);
