import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Password reset in a real browser (BUILD F-8 "Tests": FR-7, FR-8, NFR-12, D24.4, D24.6).
// Two browser contexts stand for two devices.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD, uniqueEmail } = await import("../rls/helpers");

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";
const NEW_PASSWORD = "a-brand-new-password-2";

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

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
}

test("reset: new password works, the old one doesn't, other sessions end (FR-7, FR-8, D24.4)", async ({
  browser,
}) => {
  const user = await createUser("e2e-reset");
  const deviceB = await (await browser.newContext()).newPage();
  await signIn(deviceB, user.email, PASSWORD);
  await expect(deviceB).toHaveURL(/\/dashboard$/);

  const deviceA = await (await browser.newContext()).newPage();
  await requestReset(deviceA, user.email);
  const link = await confirmPath(user.email);
  await deviceA.goto(link);
  await expect(deviceA).toHaveURL(/\/reset-password$/);
  await expect(
    deviceA.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await expect(deviceA.getByRole("main").getByText(user.email)).toBeVisible();

  await deviceA.locator('input[name="password"]').fill(NEW_PASSWORD);
  await deviceA.getByRole("button", { name: "Save new password" }).click();
  await expect(deviceA).toHaveURL(/\/dashboard$/);
  await expect(deviceA.getByText("Password changed.")).toBeVisible();

  // D24.4: the other device is signed out.
  await deviceB.goto("/dashboard");
  await expect(deviceB).toHaveURL(/\/sign-in/);

  // The old password fails, the new one works.
  const fresh = await (await browser.newContext()).newPage();
  await signIn(fresh, user.email, PASSWORD);
  await expect(fresh.locator("[data-form-alert]")).toHaveText(
    "Wrong email or password. Try again, or reset your password.",
  );
  await signIn(fresh, user.email, NEW_PASSWORD);
  await expect(fresh).toHaveURL(/\/dashboard$/);

  // The same link again: used → S-8.
  await fresh.goto(link);
  await expect(fresh).toHaveURL(/\/auth\/error\?reason=link/);
});

test("/reset-password without a reset link shows the expired content (D24.6)", async ({
  page,
}) => {
  const user = await createUser("e2e-noreset");
  await signIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "That link didn't work" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Send a new reset link" }),
  ).toBeVisible();
});

test("an unknown email gets the same M-3, and no email is sent (NFR-12)", async ({
  page,
}) => {
  const nobody = uniqueEmail("nobody-reset");
  await requestReset(page, nobody);
  await expect(
    page.getByText(
      `If there's an account for ${nobody}, we've sent it a link to reset your password.`,
    ),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  const search = await (
    await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${nobody}`)}`,
    )
  ).json();
  expect(search.messages?.length ?? 0).toBe(0);
});
