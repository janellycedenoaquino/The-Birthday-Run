import { describe, expect, it } from "vitest";
import {
  e2eEnvSchema,
  formatEnvError,
  publicEnvSchema,
  serverEnvSchema,
  supabaseConfigEnvSchema,
} from "@/lib/env/schema";

// Test values only: shaped like real ones, valid nowhere.
const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testtesttest",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};
const serverEnv = {
  ...publicEnv,
  SUPABASE_SECRET_KEY: "sb_secret_testtesttesttest",
  RATE_LIMIT_HMAC_SECRET: "x".repeat(32),
  EMAIL_TRANSPORT: "mailpit",
  EMAIL_FROM: "App <app@example.com>",
  MAILPIT_URL: "http://127.0.0.1:54324",
};
const production = {
  ...serverEnv,
  VERCEL_ENV: "production",
  EMAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_testtesttest",
  NEXT_PUBLIC_SITE_URL: "https://app.example.com",
  NEXT_PUBLIC_SENTRY_DSN: "https://key@o0.ingest.sentry.io/0",
};

const failing = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.path[0]);

describe("serverEnvSchema (FR-52)", () => {
  it("accepts a complete local env", () => {
    expect(serverEnvSchema.safeParse(serverEnv).success).toBe(true);
  });

  it("accepts a complete production env", () => {
    expect(serverEnvSchema.safeParse(production).success).toBe(true);
  });

  it("treats empty values as missing", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({ ...serverEnv, SUPABASE_SECRET_KEY: "" }),
      ),
    ).toEqual(["SUPABASE_SECRET_KEY"]);
  });

  it("requires sb_ key prefixes (decision 0006)", () => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOi.legacy.anon",
      SUPABASE_SECRET_KEY: "eyJhbGciOi.legacy.service",
    });
    expect(failing(result)).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
  });

  it("rejects the two sb_ keys swapped", () => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_testtesttesttest",
      SUPABASE_SECRET_KEY: "sb_publishable_testtesttest",
    });
    expect(failing(result)).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
  });

  it("requires a 32-character HMAC secret", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          RATE_LIMIT_HMAC_SECRET: "short",
        }),
      ),
    ).toEqual(["RATE_LIMIT_HMAC_SECRET"]);
  });

  it("refuses mailpit in production", () => {
    const result = serverEnvSchema.safeParse({
      ...production,
      EMAIL_TRANSPORT: "mailpit",
      MAILPIT_URL: "http://127.0.0.1:54324",
    });
    expect(failing(result)).toEqual(["EMAIL_TRANSPORT"]);
  });

  it("requires RESEND_API_KEY for resend and MAILPIT_URL for mailpit", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({ ...serverEnv, EMAIL_TRANSPORT: "resend" }),
      ),
    ).toEqual(["RESEND_API_KEY"]);
    expect(
      failing(
        serverEnvSchema.safeParse({ ...serverEnv, MAILPIT_URL: undefined }),
      ),
    ).toEqual(["MAILPIT_URL"]);
  });

  it("requires the site URL and Sentry DSN only in production", () => {
    const { NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SENTRY_DSN, ...rest } =
      production;
    void NEXT_PUBLIC_SITE_URL;
    void NEXT_PUBLIC_SENTRY_DSN;
    expect(failing(serverEnvSchema.safeParse(rest))).toEqual([
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_SENTRY_DSN",
    ]);
    expect(
      serverEnvSchema.safeParse({ ...rest, VERCEL_ENV: "preview" }).success,
    ).toBe(true);
  });

  it("rejects a site URL with a trailing slash", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          NEXT_PUBLIC_SITE_URL: "http://localhost:3000/",
        }),
      ),
    ).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("accepts EMAIL_FROM as an address or Name <address>, nothing else", () => {
    expect(
      serverEnvSchema.safeParse({ ...serverEnv, EMAIL_FROM: "app@example.com" })
        .success,
    ).toBe(true);
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          EMAIL_FROM: "App <not-an-address>",
        }),
      ),
    ).toEqual(["EMAIL_FROM"]);
  });
});

describe("hardening from the pre-push review", () => {
  it.each([
    ["NEXT_PUBLIC_SUPABASE_URL", "javascript:alert(1)"],
    ["NEXT_PUBLIC_SUPABASE_URL", "localhost:54321"],
    ["NEXT_PUBLIC_SENTRY_DSN", "mailto:x@example.com"],
    ["MAILPIT_URL", "file:///etc/passwd"],
  ])("rejects non-http(s) %s=%s", (name, value) => {
    expect(
      failing(serverEnvSchema.safeParse({ ...serverEnv, [name]: value })),
    ).toEqual([name]);
  });

  it.each([
    "http://localhost:3000/app",
    "http://localhost:3000?x=1",
    "http://localhost:3000#top",
  ])("rejects a site URL that isn't a bare origin: %s", (value) => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          NEXT_PUBLIC_SITE_URL: value,
        }),
      ),
    ).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("treats whitespace-only values as missing and trims the rest", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          EMAIL_TRANSPORT: "resend",
          RESEND_API_KEY: "  ",
        }),
      ),
    ).toEqual(["RESEND_API_KEY"]);
    expect(
      serverEnvSchema.parse({ ...serverEnv, EMAIL_FROM: " app@example.com\n" })
        .EMAIL_FROM,
    ).toBe("app@example.com");
  });

  it("rejects a bare sb_ prefix or a key with spaces", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          SUPABASE_SECRET_KEY: "sb_secret_",
        }),
      ),
    ).toEqual(["SUPABASE_SECRET_KEY"]);
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          SUPABASE_SECRET_KEY: "sb_secret_ x",
        }),
      ),
    ).toEqual(["SUPABASE_SECRET_KEY"]);
  });

  it("rejects line breaks in EMAIL_FROM (header injection)", () => {
    expect(
      failing(
        serverEnvSchema.safeParse({
          ...serverEnv,
          EMAIL_FROM: "Evil\r\nBcc: v@x.co <a@b.co>",
        }),
      ),
    ).toEqual(["EMAIL_FROM"]);
  });
});

describe("the env parts stay separate (D24.28)", () => {
  it("publicEnvSchema drops server values", () => {
    const parsed = publicEnvSchema.parse(serverEnv);
    expect(parsed).not.toHaveProperty("SUPABASE_SECRET_KEY");
    expect(parsed).not.toHaveProperty("RATE_LIMIT_HMAC_SECRET");
  });

  it("serverEnvSchema doesn't need the supabase config values", () => {
    const parsed = serverEnvSchema.parse({
      ...serverEnv,
      TURNSTILE_SECRET_KEY: "x",
      GOOGLE_CLIENT_SECRET: "y",
    });
    expect(parsed).not.toHaveProperty("TURNSTILE_SECRET_KEY");
    expect(parsed).not.toHaveProperty("GOOGLE_CLIENT_SECRET");
  });

  it("supabaseConfigEnvSchema requires its four values", () => {
    expect(failing(supabaseConfigEnvSchema.safeParse({}))).toEqual([
      "TURNSTILE_SECRET_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
    ]);
  });
});

describe("e2eEnvSchema", () => {
  it("defaults an empty target to local", () => {
    expect(e2eEnvSchema.parse({ E2E_TARGET: "" }).E2E_TARGET).toBe("local");
  });

  it("requires E2E_EMAIL for the deployed run", () => {
    expect(failing(e2eEnvSchema.safeParse({ E2E_TARGET: "deployed" }))).toEqual(
      ["E2E_EMAIL"],
    );
  });
});

describe("formatEnvError (FR-52)", () => {
  it("names the variables and never their values", () => {
    const secret = "sb_secret_this-must-never-be-printed";
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      SUPABASE_SECRET_KEY: secret.replace("sb_", ""),
      RATE_LIMIT_HMAC_SECRET: "leakme",
    });
    expect(result.success).toBe(false);
    const message = formatEnvError(result.error!);
    expect(message).toBe(
      "Missing or invalid environment variables: SUPABASE_SECRET_KEY, RATE_LIMIT_HMAC_SECRET",
    );
    expect(message).not.toContain("secret_this");
    expect(message).not.toContain("leakme");
  });
});
