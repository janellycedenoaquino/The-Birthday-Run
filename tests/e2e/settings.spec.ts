import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ownIp, passwordSignIn } from "./support";

// Its own client IP, so sign-ins don't share one per-IP budget (support.ts ownIp).
test.use(ownIp(18));

// Settings in a real browser (BUILD F-11 "Tests": FR-12, FR-14, D24.4).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");

async function signIn(page: Page, email: string, password: string) {
  await passwordSignIn(page, email, password);
  await expect(page).toHaveURL(/\/rewards$/);
}

test("display name: saved, shown in the account menu (FR-12)", async ({
  page,
}) => {
  const user = await createUser("e2e-name");
  await signIn(page, user.email, PASSWORD);
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("  Sam Rivera  ");
  await page
    .locator("#profile")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  // The dashboard's greeting is gone (decision 0018): the account menu shows the name.
  await page.goto("/rewards");
  await page.getByRole("button", { name: /account/ }).click();
  await expect(page.getByRole("menu").getByText("Sam Rivera")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Sam\u0001");
  await page
    .locator("#profile")
    .getByRole("button", { name: "Save", exact: true })
    .click();
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
