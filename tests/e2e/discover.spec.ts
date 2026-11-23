import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { watchCsp } from "./support";

// Discover and enrollment in a real browser (BUILD F-3 "Tests": FR-2, FR-3, FR-4, FR-8, D3).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { sql } = await import("../rls/helpers");

test("signed out: popular cards only, the real count, and a 404 for the rest (FR-2, D3)", async ({
  page,
}) => {
  const violations = await watchCsp(page);
  const db = sql();
  const [counts] = await db<{ popular: number; total: number }[]>`
    select (count(*) filter (where is_popular))::int as popular, count(*)::int as total
    from public.retailers where retired_at is null`;
  await db.end();

  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { name: "Discover", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(
    counts!.popular,
  );
  await expect(page.getByRole("heading", { name: "Starbucks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "16 Handles" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(
      `And ${counts!.total - counts!.popular} more birthday rewards.`,
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  // No toggles signed out.
  await expect(page.getByRole("button", { name: /^Add/ })).toHaveCount(0);

  // A non-popular retailer isn't reachable by URL when signed out.
  const res = await page.goto("/discover/16-handles");
  expect(res?.status()).toBe(404);
  // A popular one is, with its timing label and requirements.
  await page.goto("/discover/starbucks");
  await expect(
    page.getByRole("heading", { name: "Starbucks", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Back to Discover")).toBeVisible();

  expect(violations).toEqual([]);
});

// The signed-in Discover steps run in tests/e2e/onboarding.spec.ts with its user (one sign-in).
