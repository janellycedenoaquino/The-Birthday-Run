import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Delete account in a real browser (BUILD F-11 "Tests": FR-16, D12; phase 4 "done when": after
// deletion the user can't sign in and their rows are gone).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { adminClient, createUser, PASSWORD } = await import("../rls/helpers");

test("delete account: typed email confirms; signed out; can't sign in; rows gone (FR-16)", async ({
  page,
}) => {
  const user = await createUser("e2e-delete");
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings#delete-account");
  const confirm = page.getByLabel(/Type your email to confirm/);
  const button = page.getByRole("button", { name: "Delete my account" });
  await confirm.fill("not-my-email@example.test");
  await expect(button).toBeDisabled();
  await confirm.fill(user.email.toUpperCase()); // case-insensitive
  await button.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" }),
  ).toBeVisible();

  const admin = adminClient();
  expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull();
  const { data: rows } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id);
  expect(rows).toEqual([]);

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-form-alert]")).toHaveText(
    "Wrong email or password. Try again, or reset your password.",
  );
});
