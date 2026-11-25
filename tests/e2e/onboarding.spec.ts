import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ownIp, passwordSignIn } from "./support";

// Its own client IP, so sign-ins don't share one per-IP budget (support.ts ownIp).
test.use(ownIp(14));

// Onboarding step 1 and the Settings birthday card (BUILD F-2 "Tests": FR-6, FR-9, FR-10, FR-49).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createUser, PASSWORD } = await import("../rls/helpers");

// One user for the whole flow: e2e sign-ins share the real per-IP limit (BUILD §0.4: 20 per
// 10 minutes), so new specs reuse a user instead of signing in again.
test("a new user: onboarding, Discover, then Settings (FR-3, FR-6, FR-7, FR-8, FR-9, FR-10)", async ({
  page,
}) => {
  const user = await createUser("e2e-onboard", { onboarded: false });
  await passwordSignIn(page, user.email, PASSWORD);
  // The dashboard needs a birthday, so the sign-in lands on onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "When's your birthday?" }),
  ).toBeVisible();

  // Rewards before a birthday is saved: the line asks for one and links back here (M-295d/e).
  await page.goto("/discover");
  await expect(
    page.getByText("Add your birthday to start your countdowns."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add my birthday" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

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

  // "← Change birthday" brings step 1 back, filled in; Continue returns to step 2 (owner).
  await page.getByRole("link", { name: "← Change birthday" }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=1$/);
  await expect(page.getByLabel("Month")).toHaveValue("2");
  await expect(page.getByLabel("Day")).toHaveValue("29");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: pick two programs (search filters the list; hidden ticks still count) (FR-7).
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose programs to continue" }),
  ).toBeDisabled();
  await page.getByLabel("Search programs").fill("starbucks");
  await page.getByRole("checkbox", { name: /Starbucks/ }).check();
  await page.getByLabel("Search programs").fill("sephora");
  await page.getByRole("checkbox", { name: /Sephora/ }).check();
  await page.getByLabel("Search programs").fill("");
  await page.getByRole("button", { name: "Save 2 programs" }).click();
  // The finish card: the count and the next birthday (Feb 29 counts as Feb 28 or 29).
  await expect(page).toHaveURL(/\/onboarding\?done=1$/);
  await expect(
    page.getByRole("heading", { name: "You're all set!" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /^2 programs saved\. We'll count each one down for your birthday, Feb 2[89]\.$/,
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to My Rewards" }).click();
  await expect(page).toHaveURL(/\/rewards$/);

  // Done: onboarding sends you back to the dashboard, and Discover shows both as added.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/rewards$/);
  await page.goto("/discover?q=starbucks");
  await expect(
    page.getByRole("button", { name: "Add Starbucks" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Discover (FR-3, FR-8): search and category combine; no match → M-179 and "Clear filters".
  await page.goto("/discover");
  // With a birthday, the line names its next date (M-295c; Feb 29 counts as Feb 28 or 29).
  await expect(
    page.getByText(/We'll count down each one to your birthday, Feb 2[89]\.$/),
  ).toBeVisible();
  await page.getByLabel("Search by name").fill("cream");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=cream/);
  await page.getByRole("link", { name: "Beauty" }).click();
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toBeVisible();

  // A retailer's details, signed in (FR-4).
  await page.goto("/discover/sugarfish");
  await expect(
    page.getByRole("heading", { name: "Sugarfish", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Birthday only")).toBeVisible();

  // Add, then remove; the saved state survives a reload (FR-8).
  const add = page.getByRole("button", { name: "Add Sugarfish" });
  const enrolled = page.waitForResponse((r) => r.request().method() === "POST");
  await add.click();
  const added = page.getByRole("button", { name: "Add Sugarfish" });
  // Shown at once while saving (optimistic), then kept once the save is done.
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await enrolled;
  await expect(added).toBeEnabled();
  await page.reload();
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await added.click();
  await expect(
    page.getByRole("button", { name: "Add Sugarfish" }),
  ).toHaveAttribute("aria-pressed", "false");
  // Keyboard focus comes back to the toggle after the save (WCAG 2.4.3).
  await expect(
    page.getByRole("button", { name: "Add Sugarfish" }),
  ).toBeFocused();

  // Settings › Birthday (FR-9, D4): shows the onboarding answers; both forms save.
  await page.goto("/settings#birthday");
  const card = page.locator("#birthday");
  await expect(card.getByLabel("Month")).toHaveValue("2");
  await expect(card.getByLabel("Day")).toHaveValue("29");
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
