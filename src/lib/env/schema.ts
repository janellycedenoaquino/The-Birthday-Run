import { z } from "zod";
import {
  blankToUndefined,
  checkPublic,
  httpUrl,
  missing,
  nonEmpty,
  optional,
  prefixedKey,
  publicShape,
  required,
} from "./public-schema.ts";

// Env schemas (D6, BUILD F-2 "Env", names and kinds in BUILD §0.6). Pure: no values are
// read here. `next.config.ts` can't import `server-only`, so parsing lives in its consumers.
// The public half lives in `public-schema.ts`, so the browser never gets this file.

export {
  formatEnvError,
  publicEnvSchema,
  type PublicEnv,
} from "./public-schema.ts";

// Name <address> or a bare address (D24.25); no control characters (header injection).
const emailFrom = z.string().refine((value) => {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  const address = /^[^<>]+ <([^<>\s]+)>$/.exec(value)?.[1] ?? value;
  return z.email().safeParse(address).success;
}, "must be an address or Name <address>");

/** Everything the Next.js server needs at build and runtime: public plus server and secret values. */
export const serverEnvSchema = z
  .object({
    ...publicShape,
    SUPABASE_SECRET_KEY: required(prefixedKey("sb_secret_")),
    RATE_LIMIT_HMAC_SECRET: required(z.string().min(32)),
    EMAIL_TRANSPORT: required(z.enum(["resend", "mailpit"])),
    RESEND_API_KEY: optional(nonEmpty),
    EMAIL_FROM: required(emailFrom),
    MAILPIT_URL: optional(httpUrl),
    SENTRY_AUTH_TOKEN: optional(nonEmpty),
    SENTRY_ORG: optional(nonEmpty),
    SENTRY_PROJECT: optional(nonEmpty),
  })
  .superRefine((values, ctx) => {
    checkPublic(values, ctx);
    if (values.EMAIL_TRANSPORT === "resend" && !values.RESEND_API_KEY)
      missing(ctx, "RESEND_API_KEY", "required when EMAIL_TRANSPORT is resend");
    if (values.EMAIL_TRANSPORT === "mailpit") {
      if (!values.MAILPIT_URL)
        missing(ctx, "MAILPIT_URL", "required when EMAIL_TRANSPORT is mailpit");
      if (values.VERCEL_ENV === "production")
        missing(ctx, "EMAIL_TRANSPORT", "mailpit is refused in production");
    }
  });

/** Read only by `supabase config push` via `config.toml` env(); never set on Vercel (D24.28). */
export const supabaseConfigEnvSchema = z.object({
  TURNSTILE_SECRET_KEY: required(nonEmpty),
  GOOGLE_CLIENT_ID: required(nonEmpty),
  GOOGLE_CLIENT_SECRET: required(nonEmpty),
  RESEND_API_KEY: required(nonEmpty), // Supabase's SMTP password
});

/** Tests only (Playwright config). */
export const e2eEnvSchema = z
  .object({
    E2E_TARGET: z.preprocess(
      blankToUndefined,
      z.enum(["local", "deployed"]).default("local"),
    ),
    E2E_EMAIL: optional(z.email()),
  })
  .superRefine((values, ctx) => {
    if (values.E2E_TARGET === "deployed" && !values.E2E_EMAIL)
      missing(ctx, "E2E_EMAIL", "required when E2E_TARGET is deployed");
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;
