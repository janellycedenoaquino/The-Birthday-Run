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

// The birthday columns (BUILD F-2 "Tests": FR-6, FR-9, NFR-1, NFR-3).
describe("public.profiles: birthday and time zone", () => {
  const birthdayOf = async (id: string) =>
    (
      await adminClient()
        .from("profiles")
        .select("birth_month, birth_day, time_zone")
        .eq("id", id)
        .single()
    ).data;

  it("both old and new zone names are accepted (Asia/Calcutta, Asia/Kolkata)", async () => {
    for (const time_zone of ["Asia/Kolkata", "Asia/Calcutta", "Etc/GMT+12"]) {
      const { error } = await a.client
        .from("profiles")
        .update({ time_zone })
        .eq("id", a.id);
      expect(error, time_zone).toBeNull();
    }
  });

  it("A can change their own birthday and time zone", async () => {
    const { data, error } = await a.client
      .from("profiles")
      .update({ birth_month: 2, birth_day: 29, time_zone: "UTC" })
      .eq("id", a.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: a.id }]);
    expect(await birthdayOf(a.id)).toEqual({
      birth_month: 2,
      birth_day: 29,
      time_zone: "UTC",
    });
  });

  it("B can't change A's birthday (0 rows, A's row unchanged)", async () => {
    const before = await birthdayOf(a.id);
    const { data } = await b.client
      .from("profiles")
      .update({ birth_month: 1, birth_day: 1 })
      .eq("id", a.id)
      .select("id");
    expect(data).toEqual([]);
    expect(await birthdayOf(a.id)).toEqual(before);
  });

  it.each([
    ["Feb 30", { birth_month: 2, birth_day: 30 }],
    ["Apr 31", { birth_month: 4, birth_day: 31 }],
    ["month 13", { birth_month: 13, birth_day: 1 }],
    ["a month without a day", { birth_month: 6, birth_day: null }],
    // Written straight through the Data API, past the app's Zod check (decision 0009).
    ["an unknown time zone", { time_zone: "Not/AZone" }],
    ["an offset as a time zone", { time_zone: "+05:30" }],
    ["an abbreviation as a time zone", { time_zone: "EST" }],
  ])("the database refuses %s", async (_, values) => {
    const { error } = await a.client
      .from("profiles")
      .update(values)
      .eq("id", a.id);
    expect(error?.code).toBe("23514");
  });
});
