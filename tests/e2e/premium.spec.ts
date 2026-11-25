import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { setPremium } from "../../scripts/grant-premium";
import { monthDayIn, ownIp, passwordSignIn } from "./support";

// Premium in a real browser (BUILD F-7 "Tests": FR-35, FR-36, FR-39, FR-40, metric 2). A free
// account sees C-104 "coming soon" with no way to pay and no premium filter; a grant turns the
// filters and M-261 on at the next request; a revoke turns them off again.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { adminClient, createUser, PASSWORD, sql } =
  await import("../rls/helpers");

test.use(ownIp(22));

test("free → granted → revoked: prompts, filters and Settings follow (FR-35, FR-39, FR-40)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const user = await createUser("e2e-premium");
  const zone = "America/New_York";
  const b = monthDayIn(zone);
  await adminClient()
    .from("profiles")
    .update({ birth_month: b.month, birth_day: b.day, time_zone: zone })
    .eq("id", user.id);
  const db = sql();
  try {
    await passwordSignIn(page, user.email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    // Free: C-104's tag instead of the filters, and nothing to click (FR-38, FR-39; the tag is
    // decision 0016's prototype). "Coming soon" is on the Settings card below.
    await page.goto("/discover?length=day&early=1");
    const prompt = page.getByText(
      "Premium: filter by your state and reward length",
    );
    await expect(prompt).toBeVisible();
    await expect(page.getByLabel("Length")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /upgrade/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /upgrade/i })).toHaveCount(0);
    await page.goto("/settings#premium");
    const card = page.locator("#premium");
    await expect(
      card.getByText(
        "Premium is coming soon. Everything else in the app stays free.",
      ),
    ).toBeVisible();
    await expect(card.getByRole("heading")).toHaveText(["Premium"]);
    // F-8, payments off (FR-38): no checkout or portal control anywhere, and the return page
    // only says "coming soon".
    await expect(card.getByRole("button")).toHaveCount(0);
    await page.goto("/rewards");
    await expect(
      page.getByRole("button", { name: /upgrade|manage subscription/i }),
    ).toHaveCount(0);
    await page.goto("/billing/return");
    await expect(
      page.getByText(
        "Premium is coming soon. Everything else in the app stays free.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Check again" })).toHaveCount(
      0,
    );
    await page.goto("/settings#premium");

    // Granted: the next request is premium.
    expect((await setPremium(db, user.email, "grant")).outcome).toBe("granted");
    await page.reload();
    await expect(card.getByText("You have Premium.")).toBeVisible();
    await page.goto("/discover");
    await expect(page.getByLabel("Length")).toBeVisible();
    await expect(page.getByLabel("Can start before my birthday")).toBeVisible();
    await expect(prompt).toHaveCount(0);

    // Premium room: 4 groups this year, past the free 3 (FR-24).
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const name of ["Run 1", "Run 2", "Run 3", "Run 4"]) {
      const { error } = await user.client.from("reward_groups").insert({
        user_id: user.id,
        name,
        pickup_date: tomorrow,
        pickup_time: "12:00",
      });
      expect(error).toBeNull();
    }

    // Revoked: back to the prompt on the next request (FR-40: nothing cached).
    expect((await setPremium(db, user.email, "revoke")).outcome).toBe(
      "revoked",
    );
    await page.reload();
    await expect(page.getByLabel("Length")).toHaveCount(0);
    await expect(prompt).toBeVisible();

    // FR-40: nothing is deleted; Plan shows all 4, M-222 and C-104 at the limit.
    await page.goto("/plan");
    for (const name of ["Run 1", "Run 2", "Run 3", "Run 4"])
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    await expect(
      page.getByText(
        "You have more groups or rewards than the free plan allows.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("More than 3 groups is part of Premium."),
    ).toBeVisible();
  } finally {
    await db.end();
  }
});
