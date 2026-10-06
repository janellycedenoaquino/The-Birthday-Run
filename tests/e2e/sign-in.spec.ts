import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Sign-in in a real browser (BUILD F-7 "Tests": FR-3, FR-4, FR-5, FR-6, FR-18, NFR-12, D11).
// Accounts come from the local admin API (tests/rls/helpers); emails from Mailpit.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD, uniqueEmail } = await import("../rls/helpers");

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function mailCount(to: string): Promise<number> {
  const search = await (
    await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    )
  ).json();
  return search.messages?.length ?? 0;
}

async function confirmPath(to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await (
      await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      )
    ).json();
    if (search.messages?.length) {
      const message = await (
        await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)
      ).json();
      const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(
        message.HTML,
      )![1];
      const url = new URL(href.replaceAll("&amp;", "&"));
      return url.pathname + url.search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${to}`);
}

async function waitForTurnstile(page: Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
}

async function passwordSignIn(
  page: Page,
  email: string,
  password: string,
  path = "/sign-in",
) {
  await page.goto(path);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("password sign-in goes to next; signed-in /sign-in and /sign-up go on (FR-3, FR-18)", async ({
  page,
}) => {
  const user = await createUser("e2e-signin");
  await passwordSignIn(
    page,
    user.email,
    PASSWORD,
    "/sign-in?next=%2Fdashboard",
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: user.email })).toBeVisible();

  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/sign-up");
  await expect(page).toHaveURL(/\/dashboard$/);

  // A cancelled Google re-auth brings a signed-in user back to S-11, not the dashboard.
  await page.goto("/sign-in?error=oauth_cancelled");
  await expect(page).toHaveURL(/\/auth\/reauthenticate\?next=%2Fsettings$/);
});

test("a wrong password and an unknown email get the identical M-4 (NFR-12)", async ({
  page,
}) => {
  const user = await createUser("e2e-wrongpw");
  await passwordSignIn(page, user.email, "not-the-password");
  const alert = page.locator("[data-form-alert]");
  await expect(alert).toHaveText(
    "Wrong email or password. Try again, or reset your password.",
  );
  const wrongPassword = await alert.innerText();

  await passwordSignIn(page, uniqueEmail("nobody"), "whatever-password");
  await expect(page.locator("[data-form-alert]")).toHaveText(wrongPassword);
});

test("magic link: signs in once; the same link again → S-8 (FR-4)", async ({
  page,
}) => {
  const user = await createUser("e2e-link");
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Email link" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  const link = await confirmPath(user.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: user.email })).toBeVisible();

  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/error\?reason=link/);
});

test("an unknown email gets the same M-2, and no email is sent (FR-4, D11)", async ({
  page,
}) => {
  const nobody = uniqueEmail("nobody-link");
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Email link" }).click();
  await page.getByLabel("Email", { exact: true }).fill(nobody);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(
    page.getByText(
      `If there's an account for ${nobody}, we've sent it a sign-in link.`,
    ),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await mailCount(nobody)).toBe(0);
});

test("a cancelled Google sign-in returns to S-4 with a neutral note (FR-5)", async ({
  page,
}) => {
  await page.goto("/auth/callback?error=access_denied");
  await expect(page).toHaveURL(/\/sign-in\?error=oauth_cancelled/);
  await expect(
    page.getByText("Google sign-in was cancelled.", { exact: false }),
  ).toBeVisible();
});

test("sign-out clears the session cookies; the dashboard then asks to sign in (FR-6)", async ({
  page,
  context,
}) => {
  const user = await createUser("e2e-signout");
  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await context.cookies()).some((c) => c.name.startsWith("sb-"))).toBe(
    true,
  );

  await page.getByRole("button", { name: user.email }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    (await context.cookies()).filter((c) => c.name.startsWith("sb-")),
  ).toEqual([]);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});
