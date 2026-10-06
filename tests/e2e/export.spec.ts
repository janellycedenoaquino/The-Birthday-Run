import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// "Download my data" in a real browser (BUILD F-11 "Tests": FR-15, D24.19, NFR-3).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");

test("signed out: /account/export → sign-in, back to settings (NFR-3)", async ({
  request,
}) => {
  const res = await request.get("/account/export", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toMatch(/\/sign-in\?next=%2Fsettings$/);
});

test("download: a JSON file with the account; then rate limited → inline M-5 (FR-15)", async ({
  page,
}) => {
  const user = await createUser("e2e-export");
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

  await page.goto("/settings#your-data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^template-app-data-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const file = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(file).toMatchObject({
    format: "account-data-export",
    version: 1,
    account: { id: user.id, email: user.email },
  });
  expect(file.data["public.profiles"]).toHaveLength(1);

  // 5 per hour (§0.4): the 6th in a row comes back to settings with M-5 under the card.
  for (let i = 0; i < 4; i++) await page.request.get("/account/export");
  await page.goto("/account/export");
  await expect(page).toHaveURL(/\/settings\?export=rate_limited#your-data$/);
  await expect(
    page.getByText("Too many attempts. Please try again in a few minutes."),
  ).toBeVisible();
});
