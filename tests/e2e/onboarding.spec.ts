import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { passwordSignIn } from "./support";

// Onboarding step 1 and the Settings birthday card (BUILD F-2 "Tests": FR-6, FR-9, FR-10, FR-49).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");

test("a new user saves their birthday, then onboarding is done (FR-6, FR-10)", async ({
  page,
}) => {
  const user = await createUser("e2e-onboard", { onboarded: false });
  await passwordSignIn(page, user.email, PASSWORD);
  // The dashboard needs a birthday, so the sign-in lands on onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "When's your birthday?" }),
  ).toBeVisible();

  // The browser's zone is detected and shown (M-107); no year field anywhere (NFR-3).
  await expect(
    page.getByText(/^Time zone: .+ You can change it in Settings\.$/),
  ).toBeVisible();
  await expect(page.getByLabel(/year/i)).toHaveCount(0);

  // Feb 29 is offered, and picking it shows the note (FR-49, M-278).
  await page.getByLabel("Month").selectOption("2");
  await page.getByLabel("Day").selectOption("29");
  await expect(
    page.getByText(/In years without Feb 29 we count Feb 28/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Done: onboarding sends you back to the dashboard.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Settings changes the birthday and the time zone (FR-9, D4)", async ({
  page,
}) => {
  const user = await createUser("e2e-birthday");
  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings#birthday");

  const card = page.locator("#birthday");
  await expect(card.getByLabel("Month")).toHaveValue("6");
  await expect(card.getByLabel("Day")).toHaveValue("15");
  await card.getByLabel("Month").selectOption("12");
  await card.getByLabel("Day").selectOption("31");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Birthday saved.")).toBeVisible();

  await card.getByLabel("Time zone").selectOption("America/Chicago");
  // The first toast may still be showing, so wait for this save's own server-action response.
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/settings"),
  );
  await card.getByRole("button", { name: "Save" }).last().click();
  await saved;
  await expect(card.getByRole("button", { name: "Save" }).last()).toBeEnabled();

  await page.reload();
  await expect(card.getByLabel("Month")).toHaveValue("12");
  await expect(card.getByLabel("Day")).toHaveValue("31");
  await expect(card.getByLabel("Time zone")).toHaveValue("America/Chicago");
});
