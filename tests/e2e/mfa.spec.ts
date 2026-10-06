import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Two-step sign-in in a real browser (BUILD F-10 "Tests": FR-57, FR-58, FR-59). The RFC 6238
// helper plays the authenticator app.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");
const { totp } = await import("../rls/totp");

async function passwordSignIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** A code for the next 30 s step if the current one is about to end (avoids a boundary flake). */
function freshCode(secret: string) {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  return left < 3 ? totp(secret, Date.now() + left * 1000) : totp(secret);
}

test("turn on → sign in needs the code → turn off (FR-57, FR-58, FR-59)", async ({
  page,
}) => {
  test.setTimeout(90_000); // includes waiting out one 30 s code step
  const user = await createUser("e2e-mfa");
  await passwordSignIn(page, user.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  // Set up (a fresh sign-in is recent, so no gate).
  await page.goto("/settings#two-step");
  await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  await expect(
    page.getByAltText("QR code for setting up two-step sign-in"),
  ).toBeVisible();
  const secret = (await page.locator("code").innerText()).replace(/\s+/g, "");

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(
    page.getByText(
      "That code didn't work. Check the app and try the newest code.",
    ),
  ).toBeVisible();
  await page.getByLabel("6-digit code").fill(freshCode(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step sign-in is on.").first()).toBeVisible();

  // Sign out, sign in again: the password alone lands on S-10.
  await page.getByRole("button", { name: user.email }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await passwordSignIn(page, user.email);
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await expect(
    page.getByRole("heading", { name: "Enter your code" }),
  ).toBeVisible();

  // Protected pages refuse the aal1 session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/mfa\?next=%2Fdashboard/);

  await page.getByLabel("6-digit code").fill(freshCode(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Turn off with a current code.
  await page.goto("/settings#two-step");
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  // The same 30 s step's code was just used: wait for the next step so Supabase accepts it.
  const wait = (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000;
  await page.waitForTimeout(wait);
  await page
    .getByLabel("Enter a current code to turn it off")
    .fill(totp(secret));
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByText("Two-step sign-in is off.", { exact: false }).first(),
  ).toBeVisible();
});
