import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Scripts that run under plain Node (type stripping, no bundler) break on imports that only a
// bundler resolves, like a relative import without its `.ts` extension. CI caught one in
// src/lib/env/schema.ts (#9); this catches it locally. Test values only.
const root = resolve(import.meta.dirname, "../..");

describe("scripts run under plain Node", () => {
  it("check-supabase-env passes with complete dummy values", () => {
    const out = execFileSync(
      process.execPath,
      ["scripts/check-supabase-env.ts"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          TURNSTILE_SECRET_KEY: "test-turnstile-secret",
          GOOGLE_CLIENT_ID: "test-google-id",
          GOOGLE_CLIENT_SECRET: "test-google-secret",
          RESEND_API_KEY: "test-resend-key",
        },
      },
    );
    expect(out).toBe("check-supabase-env: ok\n");
  });
});
