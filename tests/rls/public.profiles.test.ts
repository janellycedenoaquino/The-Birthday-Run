import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  signIn,
  type TestUser,
} from "./helpers";
import { totp } from "./totp";

// public.profiles RLS through PostgREST (NFR-2, FR-12, D8; BUILD F-1 "Tests").
// Required for every USER_DATA_TABLES entry (the coverage test checks this file exists).

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await createUser("profiles-a");
  b = await createUser("profiles-b");
});
afterAll(() => deleteUsers(a, b));

describe("public.profiles: own row only", () => {
  it("A reads exactly their own row", async () => {
    const { data, error } = await a.client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: a.id }]);
  });

  it("B can't read A's row", async () => {
    const { data } = await b.client
      .from("profiles")
      .select("id")
      .eq("id", a.id);
    expect(data).toEqual([]);
  });

  it("a signed-out visitor can't read any row", async () => {
    const { data, error } = await publicClient().from("profiles").select("id");
    // anon has no table privileges at all: refused, not just filtered.
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("B can't update A's display name", async () => {
    await b.client
      .from("profiles")
      .update({ display_name: "hacked" })
      .eq("id", a.id);
    const { data } = await adminClient()
      .from("profiles")
      .select("display_name")
      .eq("id", a.id)
      .single();
    expect(data?.display_name).not.toBe("hacked");
  });

  it("A can update their own display name", async () => {
    const { error } = await a.client
      .from("profiles")
      .update({ display_name: "Ada" })
      .eq("id", a.id);
    expect(error).toBeNull();
    const { data } = await adminClient()
      .from("profiles")
      .select("display_name")
      .eq("id", a.id)
      .single();
    expect(data?.display_name).toBe("Ada");
  });

  it("A can't update any other column of their own row", async () => {
    for (const change of [
      { welcome_email_sent_at: new Date().toISOString() },
      { password_set_at: null },
      { created_at: new Date(0).toISOString() },
    ]) {
      const { error } = await a.client
        .from("profiles")
        .update(change)
        .eq("id", a.id);
      expect(error?.code).toBe("42501");
    }
  });

  it("nobody can insert a profile", async () => {
    const { error } = await a.client.from("profiles").insert({ id: b.id });
    expect(error?.code).toBe("42501");
    const { error: anonError } = await publicClient()
      .from("profiles")
      .insert({ id: a.id });
    expect(anonError?.code).toBe("42501");
  });

  it("B and a signed-out visitor can't delete A's row", async () => {
    await b.client.from("profiles").delete().eq("id", a.id);
    await publicClient().from("profiles").delete().eq("id", a.id);
    const { data } = await adminClient()
      .from("profiles")
      .select("id")
      .eq("id", a.id);
    expect(data).toHaveLength(1);
  });

  it("A can't delete their own row either (deletion is by account cascade)", async () => {
    const { error } = await a.client.from("profiles").delete().eq("id", a.id);
    expect(error?.code).toBe("42501");
  });
});

describe("public.profiles: MFA (D8, FR-58)", () => {
  let m: TestUser;
  afterAll(() => deleteUsers(m));

  it("an MFA user's aal1 session reads 0 rows until the code is entered", async () => {
    m = await createUser("profiles-mfa");
    const { data: factor, error } = await m.client.auth.mfa.enroll({
      factorType: "totp",
    });
    expect(error).toBeNull();
    const { error: verifyError } = await m.client.auth.mfa.challengeAndVerify({
      factorId: factor!.id,
      code: totp(factor!.totp.secret),
    });
    expect(verifyError).toBeNull();

    // A fresh password sign-in is aal1 while the user has a verified factor.
    const pending = await signIn(m.email);
    const { data: rows } = await pending.from("profiles").select("id");
    expect(rows).toEqual([]);

    // After the code (aal2), the row is visible again.
    const { error: stepUpError } = await pending.auth.mfa.challengeAndVerify({
      factorId: factor!.id,
      code: totp(factor!.totp.secret, Date.now() + 30_000),
    });
    expect(stepUpError).toBeNull();
    const { data: after } = await pending.from("profiles").select("id");
    expect(after).toEqual([{ id: m.id }]);
  });
});
