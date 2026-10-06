import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";

// BUILD F-4 "Scrubber" (NFR-17, D15, rule 20): nothing personal or secret reaches Sentry.

const EMAIL = "alice.smith+test@example.com";
// A fake JWT ({"alg":"HS256"}.{"sub":"test"}.signature), built from parts so the secret
// scanner doesn't flag a token-shaped literal in the repo.
const JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiJ0ZXN0In0",
  "c2lnbmF0dXJl",
].join(".");

const event = (): ErrorEvent =>
  ({
    type: undefined,
    message: `failed for ${EMAIL}`,
    user: { id: "u1", email: EMAIL, ip_address: "203.0.113.9" },
    request: {
      url: "https://app.example/auth/confirm?token_hash=abc123&type=signup#frag",
      method: "POST",
      cookies: { "sb-access-token": JWT },
      headers: { authorization: `Bearer ${JWT}`, cookie: `sb=${JWT}` },
      data: { password: "hunter2hunter2", email: EMAIL },
      query_string: "token_hash=abc123",
    },
  }) as ErrorEvent;

describe("scrubEvent", () => {
  it("drops the user and the request's cookies, headers, body and query", () => {
    const out = scrubEvent(event());
    expect(out).not.toBeNull();
    expect(out!.user).toBeUndefined();
    expect(out!.request).toEqual({
      url: "https://app.example/auth/confirm",
      method: "POST",
    });
  });

  it("redacts emails, JWTs and keys in the message, exceptions and log entry", () => {
    const e = event();
    e.exception = {
      values: [
        {
          type: "Error",
          value: `bad token ${JWT} key sb_secret_abcDEF123456789_xyz and re_AbCdEf123456 for ${EMAIL}`,
          stacktrace: {
            frames: [{ function: "f", vars: { password: "hunter2hunter2" } }],
          },
        },
      ],
    };
    e.logentry = { message: `login ${EMAIL}`, params: [EMAIL] };
    const out = scrubEvent(e)!;
    const text = JSON.stringify(out);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(JWT);
    expect(text).not.toContain("sb_secret_abcDEF");
    expect(text).not.toContain("re_AbCdEf123456");
    expect(text).not.toContain("hunter2");
    expect(out.message).toBe("failed for [email]");
    expect(out.exception!.values![0].value).toBe(
      "bad token [jwt] key [key] and [key] for [email]",
    );
  });

  it("redacts token values in URL-encoded text", () => {
    const e = event();
    e.message =
      "GET /auth/confirm?token_hash=abc123&type=recovery&code=xyz&refresh_token=r1 failed";
    expect(scrubEvent(e)!.message).toBe(
      "GET /auth/confirm?token_hash=[redacted]&type=recovery&code=[redacted]&refresh_token=[redacted] failed",
    );
  });

  it("deep-redacts extra, contexts and tags, and survives cycles and deep nesting", () => {
    const e = event();
    const cyclic: Record<string, unknown> = { email: EMAIL };
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = { leaf: EMAIL };
    for (let i = 0; i < 10; i++) deep = { deep };
    e.extra = { cyclic, deep, note: `sent to ${EMAIL}` };
    e.contexts = { auth: { token: JWT } };
    e.tags = { who: EMAIL, op: "signIn" };
    const out = scrubEvent(e)!;
    const text = JSON.stringify(out);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(JWT);
    expect(out.extra!.note).toBe("sent to [email]");
    expect(out.tags!.op).toBe("signIn");
  });

  it("scrubs the event's breadcrumbs", () => {
    const e = event();
    e.breadcrumbs = [
      {
        category: "navigation",
        data: {
          from: "/sign-in?next=%2Fsettings",
          to: "/auth/confirm?code=abc",
        },
      },
    ];
    const out = scrubEvent(e)!;
    expect(out.breadcrumbs![0].data).toEqual({
      from: "/sign-in",
      to: "/auth/confirm",
    });
  });

  it("returns null (drops the event) if scrubbing itself fails", () => {
    const e = event();
    Object.defineProperty(e, "request", {
      get() {
        throw new Error("boom");
      },
    });
    expect(scrubEvent(e)).toBeNull();
  });
});

describe("scrubBreadcrumb", () => {
  it("strips queries from URLs, redacts the message and drops the body", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      message: `POST for ${EMAIL}`,
      data: {
        url: "https://project.supabase.co/auth/v1/verify?token=abc",
        method: "POST",
        body: `{"password":"hunter2hunter2"}`,
      },
    } satisfies Breadcrumb);
    expect(out).toEqual({
      category: "fetch",
      message: "POST for [email]",
      data: {
        url: "https://project.supabase.co/auth/v1/verify",
        method: "POST",
      },
    });
  });

  it("returns null if scrubbing itself fails", () => {
    const crumb = {} as Breadcrumb;
    Object.defineProperty(crumb, "data", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(scrubBreadcrumb(crumb)).toBeNull();
  });
});

// Second-opinion review of #12: shapes a secret arrives in besides `key=value`.
describe("redaction beyond key=value", () => {
  const crumb = (data: Record<string, unknown>): Breadcrumb => ({
    category: "fetch",
    data,
  });

  it.each([
    ['{"refresh_token":"abc123"}', '{"refresh_token":"[redacted]"}'],
    ["password: hunter2 was wrong", "password: [redacted] was wrong"],
    ["api-key=xyz", "api-key=[redacted]"],
    ["token%3Dabc&x=1", "token%3D[redacted]&x=1"],
    ["user%40example.com", "[email]"],
    ["?code=pkce123", "?code=[redacted]"],
  ])("redacts %s in an exception message", (input, output) => {
    const event = scrubEvent({
      exception: { values: [{ value: input }] },
    } as ErrorEvent);
    expect(event?.exception?.values?.[0].value).toBe(output);
  });

  it("keeps a JSON error code (not a secret)", () => {
    const event = scrubEvent({
      exception: { values: [{ value: '{"code":"weak_password"}' }] },
    } as ErrorEvent);
    expect(event?.exception?.values?.[0].value).toBe(
      '{"code":"weak_password"}',
    );
  });

  it("redacts more secret key names and emails used as keys", () => {
    const event = scrubEvent({
      extra: {
        "x-api-key": "k1",
        private_key: "k2",
        service_role_key: "k3",
        otp: "123456",
        "someone@example.com": { visits: 3 },
      },
    } as unknown as ErrorEvent);
    expect(event?.extra).toEqual({
      "x-api-key": "[redacted]",
      private_key: "[redacted]",
      service_role_key: "[redacted]",
      otp: "[redacted]",
      "[email]": { visits: 3 },
    });
  });

  it("redacts a URL path and the transaction, not only the query", () => {
    const event = scrubEvent({
      request: { url: "https://app.test/u/someone@example.com?token=x" },
      transaction: "/u/someone@example.com",
    } as ErrorEvent);
    expect(event?.request?.url).toBe("https://app.test/u/[email]");
    expect(event?.transaction).toBe("/u/[email]");
  });

  it("drops thread frame vars and redacts mechanism data", () => {
    const event = scrubEvent({
      threads: {
        values: [{ stacktrace: { frames: [{ vars: { password: "p" } }] } }],
      },
      exception: {
        values: [
          {
            value: "x",
            mechanism: { type: "generic", data: { note: "a@b.co" } },
          },
        ],
      },
    } as unknown as ErrorEvent);
    expect(event?.threads?.values?.[0].stacktrace?.frames?.[0].vars).toBe(
      undefined,
    );
    expect(event?.exception?.values?.[0].mechanism?.data).toEqual({
      note: "[email]",
    });
  });

  it("drops a breadcrumb's separate query and fragment fields", () => {
    const out = scrubBreadcrumb(
      crumb({
        url: "https://api.test/x",
        "http.query": "?token=abc",
        "http.fragment": "#access_token=abc",
      }),
    );
    expect(out?.data).toEqual({ url: "https://api.test/x" });
  });
});
