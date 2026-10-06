import { afterAll, describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN,
  confirmFromEmail,
  publicClient,
  sql,
  uniqueEmail,
} from "./helpers";

// D10 / T2 / NFR-26: only the inbox owner ever sets the password (decision 0008). These run the
// real flows against local Supabase, including the confirmation email in Mailpit.

const emails: string[] = [];
afterAll(async () => {
  const db = sql();
  try {
    await db`delete from auth.users where email = any(${emails})`;
  } finally {
    await db.end();
  }
});

const passwordHashStored = async (email: string) => {
  const db = sql();
  try {
    const [row] = await db<{ has: boolean }[]>`
      select coalesce(encrypted_password, '') <> '' as has from auth.users where email = ${email}`;
    return row?.has;
  } finally {
    await db.end();
  }
};

describe("pre-account takeover through GoTrue's own /signup (T2)", () => {
  it("an attacker's password doesn't survive the owner confirming the email", async () => {
    const victim = uniqueEmail("t2-victim");
    emails.push(victim);
    const attackerPassword = "attacker-chosen-password-1";

    // The attacker skips the app and calls the signup endpoint directly with a password.
    const { error } = await publicClient().auth.signUp({
      email: victim,
      password: attackerPassword,
      options: { captchaToken: CAPTCHA_TOKEN },
    });
    expect(error).toBeNull();

    // The owner clicks the genuine confirmation email (verified like /auth/confirm does).
    await confirmFromEmail(victim);

    expect(await passwordHashStored(victim)).toBe(false);
    const { error: signInError } = await publicClient().auth.signInWithPassword(
      {
        email: victim,
        password: attackerPassword,
        options: { captchaToken: CAPTCHA_TOKEN },
      },
    );
    expect(signInError?.code).toBe("invalid_credentials");
  });
});

describe("D10's own sign-up still works", () => {
  it("email first, confirm through the link, then the owner sets a password and signs in", async () => {
    const email = uniqueEmail("d10-owner");
    emails.push(email);
    const { error } = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken: CAPTCHA_TOKEN },
    });
    expect(error).toBeNull();

    // Confirming through the link signs the owner in; the app then sends them to set a password.
    // GoTrue stores a random hash for a new OTP user; confirmation must clear it (week-1 check 6),
    // or mark_password_set would record a password the owner never chose (D24.1).
    const owner = await confirmFromEmail(email);
    expect(await passwordHashStored(email)).toBe(false);
    // No password chosen yet, so nothing to record: the set-password step stays required.
    expect((await owner.rpc("mark_password_set")).data).toBe(false);

    // As the signed-in owner, like /auth/set-password does (D10), then record it.
    const { error: setError } = await owner.auth.updateUser({
      password: "the-owners-own-password-1",
    });
    expect(setError).toBeNull();
    expect((await owner.rpc("mark_password_set")).data).toBe(true);

    const { error: signInError } = await publicClient().auth.signInWithPassword(
      {
        email,
        password: "the-owners-own-password-1",
        options: { captchaToken: CAPTCHA_TOKEN },
      },
    );
    expect(signInError).toBeNull();
  });
});
