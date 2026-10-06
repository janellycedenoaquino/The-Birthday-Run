import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/config/app";
import { msg } from "@/lib/messages";

// MFA actions (BUILD F-10, FR-57..FR-59, D8, D24.3, rule 6). Supabase, the limiter's DB and
// Next's request APIs are the faked boundaries; the guards are real.

const mfa = { enroll: vi.fn(), unenroll: vi.fn(), challengeAndVerify: vi.fn() };
const state = {
  factors: [] as { id: string; factor_type: string; status: string }[],
  aal: "aal1",
  amrAge: 60,
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      mfa,
      getUser: async () => ({
        data: {
          user: {
            id: "user-1",
            email: "someone@example.com",
            email_confirmed_at: "2026-09-29T00:00:00Z",
            identities: [{ provider: "email" }],
            factors: state.factors,
          },
        },
        error: null,
      }),
      getClaims: async () => ({
        data: {
          claims: {
            aal: state.aal,
            amr: [
              {
                method: "password",
                timestamp: Date.now() / 1000 - state.amrAge,
              },
            ],
          },
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { password_set_at: "2026-09-29T00:00:00Z" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/settings" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
  },
}));

const {
  startMfaEnrollment,
  confirmMfaEnrollment,
  verifyMfaSignIn,
  disableMfa,
} = await import("@/server/actions/mfa");

const FACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};
async function run(
  action: (p: null, f: FormData) => Promise<unknown>,
  fd: FormData,
) {
  try {
    return await action(null, fd);
  } catch (error) {
    return { redirect: (error as { url: string }).url };
  }
}
const codeError = {
  ok: false,
  error: "API-4",
  fieldErrors: { code: [msg("M-14")] },
};

beforeEach(() => {
  for (const fn of Object.values(mfa)) fn.mockReset();
  mfa.unenroll.mockResolvedValue({ error: null });
  mfa.challengeAndVerify.mockResolvedValue({ error: null });
  state.factors = [];
  state.aal = "aal1";
  state.amrAge = 60;
});

describe("startMfaEnrollment", () => {
  it("removes a stale unverified factor, enrolls a new one, returns what setup needs", async () => {
    state.factors = [{ id: OTHER, factor_type: "totp", status: "unverified" }];
    mfa.enroll.mockResolvedValue({
      data: {
        id: FACTOR,
        totp: {
          qr_code: "data:image/svg+xml;x",
          secret: "ABCD",
          uri: "otpauth://x",
        },
      },
      error: null,
    });
    expect(await run(startMfaEnrollment, form({}))).toEqual({
      ok: true,
      data: {
        factorId: FACTOR,
        qrCode: "data:image/svg+xml;x",
        secret: "ABCD",
        uri: "otpauth://x",
      },
    });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: OTHER });
    expect(mfa.enroll.mock.calls[0][0]).toMatchObject({
      issuer: appConfig.name,
    });
  });

  it("already on → API-5; can't start → M-15; not recent → re-auth", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "verified" }];
    state.aal = "aal2";
    expect(await run(startMfaEnrollment, form({}))).toEqual({
      ok: false,
      error: "API-5",
    });
    state.factors = [];
    state.aal = "aal1";
    mfa.enroll.mockResolvedValue({ data: null, error: { code: "x" } });
    expect(await run(startMfaEnrollment, form({}))).toEqual({
      ok: false,
      error: "M-15",
    });
    state.amrAge = 11 * 60;
    expect(await run(startMfaEnrollment, form({}))).toEqual({
      redirect: "/auth/reauthenticate?next=/settings",
    });
  });
});

describe("confirmMfaEnrollment (ownership, rule 6)", () => {
  it("verifies the user's own unverified factor → M-16", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "unverified" }];
    expect(
      await run(
        confirmMfaEnrollment,
        form({ factorId: FACTOR, code: "123456" }),
      ),
    ).toEqual({
      ok: true,
      message: "M-16",
    });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: FACTOR,
      code: "123456",
    });
  });

  it("with a verified factor already → API-5, no second one (D8)", async () => {
    state.factors = [
      { id: OTHER, factor_type: "totp", status: "verified" },
      { id: FACTOR, factor_type: "totp", status: "unverified" },
    ];
    state.aal = "aal2";
    expect(
      await run(
        confirmMfaEnrollment,
        form({ factorId: FACTOR, code: "123456" }),
      ),
    ).toEqual({
      ok: false,
      error: "API-5",
    });
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("a factor that isn't this user's unverified one → M-14, Supabase never called", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "unverified" }];
    expect(
      await run(
        confirmMfaEnrollment,
        form({ factorId: OTHER, code: "123456" }),
      ),
    ).toEqual(codeError);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("a wrong code → M-14", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "unverified" }];
    mfa.challengeAndVerify.mockResolvedValue({
      error: { code: "mfa_verification_failed" },
    });
    expect(
      await run(
        confirmMfaEnrollment,
        form({ factorId: FACTOR, code: "000000" }),
      ),
    ).toEqual(codeError);
  });
});

describe("verifyMfaSignIn (S-10)", () => {
  beforeEach(() => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "verified" }];
  });

  it("uses the verified factor from the user record, then goes to next", async () => {
    expect(
      await run(verifyMfaSignIn, form({ code: "123456", next: "/settings" })),
    ).toEqual({
      redirect: "/settings",
    });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: FACTOR,
      code: "123456",
    });
  });

  it("a factorId in the input is refused (.strict)", async () => {
    expect(
      await run(verifyMfaSignIn, form({ code: "123456", factorId: OTHER })),
    ).toMatchObject({ ok: false, error: "API-4" });
  });

  it("a wrong code → M-14; not 6 digits → M-34", async () => {
    mfa.challengeAndVerify.mockResolvedValue({
      error: { code: "mfa_verification_failed" },
    });
    expect(await run(verifyMfaSignIn, form({ code: "000000" }))).toEqual(
      codeError,
    );
    expect(await run(verifyMfaSignIn, form({ code: "12ab" }))).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { code: [msg("M-34")] },
    });
  });
});

describe("disableMfa", () => {
  it("a current code in a recent aal2 session removes the factor → M-17", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "verified" }];
    state.aal = "aal2";
    expect(await run(disableMfa, form({ code: "123456" }))).toEqual({
      ok: true,
      message: "M-17",
    });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR });
  });

  it("a wrong code → M-14, factor kept", async () => {
    state.factors = [{ id: FACTOR, factor_type: "totp", status: "verified" }];
    state.aal = "aal2";
    mfa.challengeAndVerify.mockResolvedValue({
      error: { code: "mfa_verification_failed" },
    });
    expect(await run(disableMfa, form({ code: "000000" }))).toEqual(codeError);
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });
});
