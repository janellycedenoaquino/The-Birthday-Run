import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CAPTCHA_TOKEN, PASSWORD } from "./helpers";

// The signed-out refusal test (BUILD F-2 "Tests", CLAUDE.md rules 3-4, NFR-3): every export of
// src/server/actions/* is a public endpoint, so calling it with no session must be refused. The
// real server client runs against local Supabase; only Next's request APIs are faked (no cookies).
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/settings" }),
  cookies: async () => ({ getAll: () => [], set: () => {}, has: () => false }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const dir = resolve(import.meta.dirname, "../../src/server/actions");
const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) =>
  /\.tsx?$/.test(f),
);

// Actions at the `signed-out` level (§0.2: signUp, signIn, requestMagicLink, …, added by F-6..F-8)
// have no guard by design; each gets its own tests (rate limit, identical responses). Every other
// action must be refused by its guard.
const SIGNED_OUT_LEVEL = new Set<string>([
  "signUp", // Turnstile + rate limit + identical answers (tests/unit/sign-up.test.ts, e2e)
  "signOut", // no guard by design: a no-op when signed out (D24.2)
  "signIn", // identical M-4 + rate limit + Turnstile (tests/unit/sign-in.test.ts, e2e)
  "requestMagicLink", // identical M-2, never creates accounts (D11)
  "signInWithGoogle", // public: starts the OAuth round-trip (FR-5)
  "requestPasswordReset", // identical M-3 + rate limit + Turnstile (FR-7)
]);

// Well-formed input for each guarded action, so the refusal comes from the guard, not from Zod.
const VALID: Record<string, Record<string, string>> = {
  setInitialPassword: { password: "a-long-new-password-1", next: "/dashboard" },
  updatePasswordFromReset: { password: "a-long-new-password-1" },
  updateDisplayName: { displayName: "Sam" },
  changePassword: { password: "a-long-new-password-1" },
  deleteAccount: { email: "someone@example.com" },
  startMfaEnrollment: {},
  confirmMfaEnrollment: {
    factorId: "00000000-0000-4000-8000-000000000000",
    code: "123456",
  },
  verifyMfaSignIn: { code: "123456" },
  disableMfa: { code: "123456" },
  reauthenticateWithPassword: {
    password: PASSWORD,
    "cf-turnstile-response": CAPTCHA_TOKEN,
    next: "/settings",
  },
};

const form = (entries: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

type Action = (prev: unknown, fd: FormData) => Promise<unknown>;

async function outcome(action: Action, fd: FormData) {
  try {
    return await action(null, fd);
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT"))
      return { redirect: digest.split(";")[2] };
    throw error;
  }
}

// A refusal is `{ ok: false }`, or the one redirect a guard may send an action to (§0.2):
// re-authentication with its constant next. Any other redirect could be a success.
const refused = (result: { ok?: boolean; redirect?: string }) =>
  result.ok === false ||
  result.redirect === "/auth/reauthenticate?next=/settings";

describe("every server action refuses a signed-out caller (NFR-3)", async () => {
  const actions: [string, Action, string][] = [];
  for (const file of files) {
    const mod = await import(resolve(dir, file));
    for (const [name, value] of Object.entries(mod))
      if (typeof value === "function")
        actions.push([name, value as Action, file]);
  }

  it("finds the actions (the test can't silently check nothing)", () => {
    expect(actions.map(([name]) => name)).toContain(
      "reauthenticateWithPassword",
    );
  });

  const guarded = () => actions.filter(([name]) => !SIGNED_OUT_LEVEL.has(name));

  it("has well-formed input for every guarded action", () => {
    for (const [name] of guarded()) expect(VALID, name).toHaveProperty(name);
  });

  // Zod usually refuses this first; it still shows no action answers an empty post with success.
  it.each(files)("%s: empty FormData → refused", async (file) => {
    for (const [name, action, from] of guarded())
      if (from === file)
        expect(refused((await outcome(action, form())) as object), name).toBe(
          true,
        );
  });

  it("well-formed input, no session → API-1 (the guard, not Zod)", async () => {
    for (const [name, action] of guarded())
      expect(await outcome(action, form(VALID[name])), name).toEqual({
        ok: false,
        error: "API-1",
      });
  });
});
