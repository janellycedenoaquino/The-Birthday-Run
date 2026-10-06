import { afterAll, describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN,
  PASSWORD,
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  signIn,
  sql,
  uniqueEmail,
  type TestUser,
} from "./helpers";

// F-1 database functions through PostgREST (BUILD F-1 "Operations" and "Tests").

const cleanup: { id: string }[] = [];
afterAll(() => deleteUsers(...cleanup));

describe("handle_new_user (FR-11)", () => {
  it("creates exactly one profile for an admin-created user", async () => {
    const user = await createUser("fn-admin");
    cleanup.push(user);
    const { data } = await adminClient()
      .from("profiles")
      .select("id, display_name")
      .eq("id", user.id);
    expect(data).toEqual([{ id: user.id, display_name: null }]);
  });

  it("creates exactly one profile for a signInWithOtp sign-up", async () => {
    const email = uniqueEmail("fn-otp");
    const { error } = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken: CAPTCHA_TOKEN },
    });
    expect(error).toBeNull();
    const { data: list } = await adminClient().auth.admin.listUsers({
      perPage: 1000,
    });
    const user = list.users.find((u) => u.email === email);
    expect(user).toBeDefined();
    cleanup.push(user!);
    const { data } = await adminClient()
      .from("profiles")
      .select("id")
      .eq("id", user!.id);
    expect(data).toHaveLength(1);
  });

  it("never takes the display name from an email sign-up's own metadata", async () => {
    const { data } = await adminClient().auth.admin.createUser({
      email: uniqueEmail("fn-meta"),
      email_confirm: true,
      password: PASSWORD,
      user_metadata: { full_name: "Set By Attacker" },
    });
    cleanup.push(data.user!);
    const { data: row } = await adminClient()
      .from("profiles")
      .select("display_name")
      .eq("id", data.user!.id)
      .single();
    expect(row?.display_name).toBeNull();
  });
});

describe("claim_welcome_email / release_welcome_email (FR-30, D24.11)", () => {
  it("claims once for a confirmed user, then returns false", async () => {
    const user = await createUser("fn-claim");
    cleanup.push(user);
    expect((await user.client.rpc("claim_welcome_email")).data).toBe(true);
    expect((await user.client.rpc("claim_welcome_email")).data).toBe(false);
  });

  it("returns false for an unconfirmed email", async () => {
    const { data } = await adminClient().auth.admin.createUser({
      email: uniqueEmail("fn-unconfirmed"),
      password: PASSWORD,
    });
    cleanup.push(data.user!);
    // An unconfirmed user can't get a session, so call the function as that user in Postgres:
    // the `authenticated` role with their id in the JWT claims, exactly what PostgREST sets.
    const db = sql();
    try {
      const claims = JSON.stringify({
        sub: data.user!.id,
        role: "authenticated",
      });
      const [row] = await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
        await tx`set local role authenticated`;
        return tx`select public.claim_welcome_email() as claimed`;
      });
      expect(row?.claimed).toBe(false);
    } finally {
      await db.end();
    }
  });

  it("release_welcome_email is service_role only", async () => {
    const user = await createUser("fn-release");
    cleanup.push(user);
    await user.client.rpc("claim_welcome_email");
    const { error } = await user.client.rpc("release_welcome_email", {
      p_user_id: user.id,
    });
    expect(error?.code).toBe("42501");
    const { error: adminError } = await adminClient().rpc(
      "release_welcome_email",
      { p_user_id: user.id },
    );
    expect(adminError).toBeNull();
    expect((await user.client.rpc("claim_welcome_email")).data).toBe(true);
  });
});

describe("mark_password_set (D10, D24.1)", () => {
  it("records the first time only", async () => {
    const user: TestUser = await createUser("fn-password");
    cleanup.push(user);
    const read = async () =>
      (
        await adminClient()
          .from("profiles")
          .select("password_set_at")
          .eq("id", user.id)
          .single()
      ).data?.password_set_at;
    const first = await read();
    expect(first).not.toBeNull();
    expect((await user.client.rpc("mark_password_set")).data).toBe(true);
    expect(await read()).toBe(first);
  });

  it("is refused for signed-out visitors", async () => {
    const { error } = await publicClient().rpc("mark_password_set");
    expect(error?.code).toBe("42501");
  });
});

describe("rate_limit_hit (D3, D24.12)", () => {
  const key = () => `test:${Date.now()}:${Math.random()}`;

  it("true = allowed: max 2 gives true, true, false", async () => {
    const admin = adminClient();
    const k = key();
    const hits = [];
    for (let i = 0; i < 3; i++) {
      hits.push(
        (
          await admin.rpc("rate_limit_hit", {
            p_key: k,
            p_max: 2,
            p_window_seconds: 60,
          })
        ).data,
      );
    }
    expect(hits).toEqual([true, true, false]);
  });

  it("rejects invalid arguments with 22023 (callers fail closed)", async () => {
    const admin = adminClient();
    for (const args of [
      { p_key: "", p_max: 1, p_window_seconds: 60 },
      { p_key: "x".repeat(201), p_max: 1, p_window_seconds: 60 },
      { p_key: key(), p_max: 0, p_window_seconds: 60 },
      { p_key: key(), p_max: 1, p_window_seconds: 86401 },
      { p_key: key(), p_max: null, p_window_seconds: 60 },
      { p_key: key(), p_max: 1, p_window_seconds: null },
    ]) {
      // Cast: the NULL cases stand in for a raw API caller that ignores the generated types.
      type Args = { p_key: string; p_max: number; p_window_seconds: number };
      expect(
        (await admin.rpc("rate_limit_hit", args as Args)).error?.code,
      ).toBe("22023");
    }
  });

  it("is not callable by signed-in users or visitors", async () => {
    const user = await createUser("fn-limit");
    cleanup.push(user);
    const args = { p_key: key(), p_max: 5, p_window_seconds: 60 };
    expect((await user.client.rpc("rate_limit_hit", args)).error?.code).toBe(
      "42501",
    );
    expect((await publicClient().rpc("rate_limit_hit", args)).error?.code).toBe(
      "42501",
    );
  });
});

// Signed-in aal1 sessions still reach the definer functions (claim runs during sign-in, D8 note).
describe("definer functions and MFA", () => {
  it("claim_welcome_email works for a plain aal1 session", async () => {
    const user = await createUser("fn-aal1");
    cleanup.push(user);
    const fresh = await signIn(user.email);
    expect((await fresh.rpc("claim_welcome_email")).data).toBe(true);
  });
});
