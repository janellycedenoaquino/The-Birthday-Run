import { afterAll, describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import {
  CAPTCHA_TOKEN,
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  uniqueEmail,
  type TestUser,
} from "./helpers";

// The auth emails end to end against local Supabase (BUILD F-5, FR-29, D7; week-1 check 3): GoTrue
// sends our generated templates (npm run email:build + config.toml) to Mailpit, and each link's
// baked-in `type` verifies. Needs `db:stop && db:start` after a template change.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";
const created: (TestUser | { id: string })[] = [];
afterAll(() => deleteUsers(...created));

type Mail = { Subject: string; HTML: string };
async function newestMail(to: string): Promise<Mail> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await (
      await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      )
    ).json();
    if (search.messages?.length)
      return (
        await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)
      ).json();
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no email to ${to}`);
}

function confirmLink(html: string) {
  const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(html)?.[1];
  if (!href) throw new Error("no /auth/confirm link");
  const url = new URL(href.replaceAll("&amp;", "&"));
  return {
    path: url.pathname,
    tokenHash: url.searchParams.get("token_hash")!,
    type: url.searchParams.get("type")!,
  };
}

async function expectBrandedAndVerifying(
  mail: Mail,
  subject: string,
  type: string,
) {
  expect(mail.Subject).toBe(subject);
  expect(mail.HTML).toContain(appConfig.brand.primary);
  expect(mail.HTML).toMatch(/\/brand\/logo\.png/);
  expect(mail.HTML).toContain(`mailto:${appConfig.supportEmail}`);
  const link = confirmLink(mail.HTML);
  expect(link.path).toBe("/auth/confirm");
  expect(link.type).toBe(type);
  const { error } = await publicClient().auth.verifyOtp({
    token_hash: link.tokenHash,
    type: link.type as "signup" | "magiclink" | "recovery",
  });
  expect(error).toBeNull();
}

describe("auth emails from our templates (FR-29)", () => {
  it("a new user through signInWithOtp gets E-1 (confirmation), type=signup, which verifies", async () => {
    const email = uniqueEmail("otp-new");
    const { error } = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken: CAPTCHA_TOKEN },
    });
    expect(error).toBeNull();
    const { data } = await adminClient().auth.admin.listUsers();
    const user = data.users.find((u) => u.email === email);
    if (user) created.push({ id: user.id });
    await expectBrandedAndVerifying(
      await newestMail(email),
      "Confirm your email",
      "signup",
    );
  });

  it("an existing user through signInWithOtp gets E-2 (magic_link), type=magiclink", async () => {
    const user = await createUser("otp-existing");
    created.push(user);
    const { error } = await publicClient().auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false, captchaToken: CAPTCHA_TOKEN },
    });
    expect(error).toBeNull();
    await expectBrandedAndVerifying(
      await newestMail(user.email),
      "Your sign-in link",
      "magiclink",
    );
  });

  it("a password reset gets E-3 (recovery), type=recovery", async () => {
    const user = await createUser("reset");
    created.push(user);
    const { error } = await publicClient().auth.resetPasswordForEmail(
      user.email,
      {
        captchaToken: CAPTCHA_TOKEN,
      },
    );
    expect(error).toBeNull();
    await expectBrandedAndVerifying(
      await newestMail(user.email),
      "Reset your password",
      "recovery",
    );
  });
});
