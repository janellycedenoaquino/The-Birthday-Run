import { z } from "zod";

// No JIT: Zod otherwise probes `Function("")` on first parse to compile faster parsers, and the
// CSP (no 'unsafe-eval', D5) blocks that as a violation (NFR-13: 0 violations). This module is the
// first Zod user in the browser (instrumentation-client → Sentry options → publicEnv), and the
// setting is global, so later client-side schemas get it too.
z.config({ jitless: true });

// The public half of the env schemas (D6, BUILD F-2 "Env"): `NEXT_PUBLIC_*` plus the shared helpers.
// Split from `schema.ts` so `public.ts`, which client components may import, pulls no server or
// secret schema into browser files (not even variable names). Pure: no values are read here.

// Values are trimmed, and an empty or whitespace-only value counts as unset: env files and
// CI often define a variable as `NAME=`.
export const blankToUndefined = (value: unknown) =>
  typeof value === "string" ? value.trim() || undefined : value;
export const required = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema);
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const nonEmpty = z.string().min(1);
// http(s) only: z.url() alone accepts javascript:, file: and "localhost:54321" (no scheme).
export const httpUrl = z.url({ protocol: /^https?$/ });
// An origin only (scheme, host, port): no trailing slash, path, query or fragment.
const siteUrl = httpUrl.refine(
  (url) => new URL(url).origin === url,
  "must be an origin like https://example.com",
);
// A prefix plus the key itself.
export const prefixedKey = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}\\S+$`), `must start with ${prefix}`);

export type Ctx = z.core.$RefinementCtx;
export const missing = (ctx: Ctx, name: string, why: string) =>
  ctx.addIssue({ code: "custom", path: [name], message: why });

export const publicShape = {
  VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
  NEXT_PUBLIC_SITE_URL: optional(siteUrl),
  NEXT_PUBLIC_SUPABASE_URL: required(httpUrl),
  // Prefix rules: local CLI 2.118 issues sb_ keys (week-1 check 9, decision 0006).
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    prefixedKey("sb_publishable_"),
  ),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: required(nonEmpty),
  NEXT_PUBLIC_SENTRY_DSN: optional(httpUrl), // empty turns Sentry off
};

type PublicValues = {
  VERCEL_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
};

export function checkPublic(values: PublicValues, ctx: Ctx) {
  if (values.VERCEL_ENV !== "production") return;
  if (!values.NEXT_PUBLIC_SITE_URL)
    missing(ctx, "NEXT_PUBLIC_SITE_URL", "required in production");
  if (!values.NEXT_PUBLIC_SENTRY_DSN)
    missing(ctx, "NEXT_PUBLIC_SENTRY_DSN", "required in production");
}

/** Bundle-safe values (`NEXT_PUBLIC_*`), read in the browser through `src/lib/env/public.ts`. */
export const publicEnvSchema = z.object(publicShape).superRefine(checkPublic);

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Names the failing variables only: never values, never Zod's message text (FR-52). */
export function formatEnvError(error: z.ZodError): string {
  const names = [
    ...new Set(
      error.issues.map((issue) => String(issue.path[0] ?? "(unknown)")),
    ),
  ];
  return `Missing or invalid environment variables: ${names.join(", ")}`;
}
