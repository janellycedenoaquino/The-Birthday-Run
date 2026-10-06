import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Settings in a real browser (BUILD F-11 "Tests": FR-12, FR-14, D24.4).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("display name: saved, shown on the dashboard (FR-12)", async ({
  page,
}) => {
  const user = await createUser("e2e-name");
  await signIn(page, user.email, PASSWORD);
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("  Sam Rivera  ");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Welcome, Sam Rivera" }),
  ).toBeVisible();

  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Sam\u0001");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Remove line breaks and tabs from your name."),
  ).toBeVisible();
});

test("change password (recent sign-in): other devices signed out (FR-14, D24.4)", async ({
  browser,
}) => {
  const user = await createUser("e2e-chpw");
  const other = await (await browser.newContext()).newPage();
  await signIn(other, user.email, PASSWORD);

  const page = await (await browser.newContext()).newPage();
  await signIn(page, user.email, PASSWORD);
  await page.goto("/settings#password");
  await page.locator('input[name="password"]').fill("a-changed-password-3");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText(
      "Password changed. You've been signed out on your other devices.",
    ),
  ).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveValue("");

  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/sign-in/);
});
