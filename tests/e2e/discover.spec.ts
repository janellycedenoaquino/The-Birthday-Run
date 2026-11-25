import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { watchCsp } from "./support";

// Discover and enrollment in a real browser (BUILD F-3 "Tests": FR-2, FR-3, FR-4, FR-8, D3, decision 0017).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { sql } = await import("../rls/helpers");

test("signed out: every non-retired retailer, the sign-up prompt, and a 404 for retired ones (FR-2, D3, decision 0017)", async ({
  page,
}) => {
  const violations = await watchCsp(page);
  const db = sql();
  const [{ total } = { total: 0 }] = await db<{ total: number }[]>`
    select count(*)::int as total from public.retailers where retired_at is null`;
  const [notPopular] = await db<{ id: string; name: string }[]>`
    select id, name from public.retailers
    where retired_at is null and not is_popular order by id limit 1`;
  const [retired] = await db<{ id: string }[]>`
    select id from public.retailers where retired_at is not null order by id limit 1`;
  await db.end();

  await page.goto("/discover");
  await expect(
    page.getByRole("heading", {
      name: "Every birthday reward, in one place.",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${total} brands with a birthday treat`),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(total);
  await expect(page.getByRole("heading", { name: "Starbucks" })).toBeVisible();
  await expect(
    page.getByText("Sign up free to track the rewards you're in", {
      exact: false,
    }),
  ).toBeVisible();
  // No toggles signed out.
  await expect(page.getByRole("button", { name: /^Add/ })).toHaveCount(0);

  // A non-popular retailer's page is public now, with the sign-up prompt in place of the toggle.
  expect(notPopular, "the catalogue has a non-popular retailer").toBeDefined();
  await page.goto(`/discover/${notPopular!.id}`);
  await expect(
    page.getByRole("heading", { name: notPopular!.name, level: 1 }),
  ).toBeVisible();
  // Decision 0016: breadcrumb back to Rewards, sign-up in place of the toggle, blurred sample
  // dates (aria-hidden) with M-280, and the visitor band.
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", {
      name: "Rewards",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign up free to track it" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign up to see your dates" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add/ })).toHaveCount(0);

  // From Discover, a card opens the same brand as a pop-up with its own URL; Escape goes back.
  await page.goto("/discover");
  const card = page.getByRole("link", { name: /Starbucks/ }).first();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/discover\/starbucks$/);
  const sheet = page.getByRole("dialog", { name: "Starbucks" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Your birthday gift")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/discover$/);
  await expect(sheet).toBeHidden();
  // Focus goes back to the card that opened it (WCAG 2.4.3).
  await expect(card).toBeFocused();

  // Retired and unknown IDs stay a 404.
  if (retired) {
    const res = await page.goto(`/discover/${retired.id}`);
    expect(res?.status()).toBe(404);
  }
  const unknown = await page.goto("/discover/no-such-retailer");
  expect(unknown?.status()).toBe(404);

  expect(violations).toEqual([]);
});

// The signed-in Discover steps run in tests/e2e/onboarding.spec.ts with its user (one sign-in).
