import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { confirmDelete, monthDayIn, ownIp, passwordSignIn } from "./support";

// Plan in a real browser (BUILD F-6 "Tests": FR-22–FR-27, NFR-6). One user, one sign-in; the
// birthday is today (New York) and the programs are set straight in the local database.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { adminClient, createUser, PASSWORD, sql } =
  await import("../rls/helpers");

// Its own client IP, so sign-ins don't share one per-IP budget (support.ts ownIp).
test.use(ownIp(21));

const ZONE = "America/New_York";
const todayIn = monthDayIn;

test("Plan: groups, keyboard reorder, edits, the limit, and pickups (FR-22–FR-27)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createUser("e2e-plan");
  const admin = adminClient();
  const b = todayIn(ZONE);
  await admin
    .from("profiles")
    .update({ birth_month: b.month, birth_day: b.day, time_zone: ZONE })
    .eq("id", user.id);
  const db = sql();
  const picks = await db<{ id: string; name: string }[]>`
    select id, name from public.retailers
    where retired_at is null and timing_type = 'birth_month' order by name limit 4`;
  await db.end();
  await admin
    .from("enrollments")
    .insert(picks.map((p) => ({ user_id: user.id, retailer_id: p.id })));
  const [first, second, third, fourth] = picks.map((p) => p.name) as [
    string,
    string,
    string,
    string,
  ];

  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "Plan your run", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No groups yet. Select rewards above and add them to a group.",
    ),
  ).toBeVisible();

  // Select two, then "Add to group" → New group (FR-23).
  await page.getByRole("checkbox", { name: new RegExp(first) }).check();
  await page.getByRole("checkbox", { name: new RegExp(second) }).check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Add to group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Plan A");
  await dialog.getByRole("button", { name: "Add to group" }).click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Plan A", level: 3 }) });
  await expect(card.getByText(first)).toBeVisible();
  await expect(page.getByText("In: Plan A").first()).toBeVisible();

  // "Hide grouped" hides them; a third goes to the existing group (FR-22, FR-26).
  await page.getByLabel("Hide grouped").check();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(first) }),
  ).toHaveCount(0);
  await page.getByLabel("Hide grouped").uncheck();
  await page.getByRole("checkbox", { name: new RegExp(third) }).check();
  await page.getByRole("button", { name: "Add to group" }).click();
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: "Existing group" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to group" })
    .click();
  await expect(card.getByText(third)).toBeVisible();

  const order = async () =>
    (await card.locator("ol > li > span").allInnerTexts()).map((t) => t.trim());
  expect(await order()).toEqual([first, second, third]);

  // Keyboard reorder on the handle: Space, ArrowDown, Space (FR-27, NFR-6).
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await card
    .getByRole("button", { name: `Move ${first}`, exact: true })
    .focus();
  // Each step waits for its announcement (M-237), as a screen-reader user would hear it.
  const status = card.getByRole("status");
  await page.keyboard.press("Space");
  await expect(status).toContainText(`Picked up ${first}. Position 1 of 3.`);
  // dnd-kit measures the rows just after the lift; a person never presses an arrow that fast.
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await expect(status).toContainText(`${first} moved to position 2 of 3.`);
  await page.keyboard.press("Space");
  await expect(status).toContainText(`${first} dropped at position 2 of 3.`);
  await saved;
  await expect.poll(order).toEqual([second, first, third]);
  await page.reload();
  await expect.poll(order).toEqual([second, first, third]);

  // The Move buttons (the no-JS path) post the whole new order.
  await card.getByRole("button", { name: `Move ${third} up` }).click();
  await expect.poll(order).toEqual([second, third, first]);

  // Rename and remove (FR-27).
  await card.getByRole("button", { name: "Edit Plan A" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Saturday run");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const renamed = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Saturday run", level: 3 }),
  });
  await expect(renamed).toBeVisible();
  await renamed.getByRole("button", { name: `Remove ${first}` }).click();
  await expect(renamed.getByText(first)).toHaveCount(0);

  // The free limit: a 4th group is refused with the number named (FR-24).
  for (const name of ["Plan B", "Plan C"]) {
    await page.getByRole("checkbox", { name: new RegExp(fourth) }).check();
    await page.getByRole("button", { name: "Add to group" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add to group" })
      .click();
    await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: new RegExp(fourth) }).check();
  await page.getByRole("button", { name: "Add to group" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Plan D");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to group" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("You've reached the free limit of 3 groups."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A pickup removes the reward from every group (FR-26): it shows as picked up here.
  await page.goto("/rewards");
  const reward = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: fourth, level: 2 }) });
  await reward.getByRole("button", { name: "Mark picked up" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mark picked up" })
    .click();
  await expect(page.getByText(`${fourth} picked up.`)).toBeVisible();
  await page.goto("/plan");
  await expect(
    page.getByRole("checkbox", { name: new RegExp(fourth) }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("heading", { name: "Plan B", level: 3 })
      .locator("xpath=ancestor::li[1]"),
  ).toContainText("No rewards in this group yet.");

  // Delete asks first, with "Cancel" focused (FR-27).
  const planC = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Plan C", level: 3 }) });
  await planC.getByRole("link", { name: "Delete Plan C" }).click();
  await confirmDelete(page, "Delete Plan C?");
  await expect(
    page.getByRole("heading", { name: "Plan C", level: 3 }),
  ).toHaveCount(0);
});

test("Duplicate: premium gets (Copy) then (Copy 2) in the same order; free gets no control (FR-28, metric 2)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { setPremium } = await import("../../scripts/grant-premium");
  const { birthdayTodayWith, groupWith } = await import("../rls/helpers");
  const db = sql();
  try {
    const ids = ["16-handles", "altard-state"];
    const make = async (label: string, premium: boolean) => {
      const user = await createUser(label);
      await birthdayTodayWith(user, ids);
      if (premium) await setPremium(db, user.email, "grant");
      await groupWith(user, "Dup run", [ids[1]!, ids[0]!]);
      return user;
    };

    const user = await make("e2e-dup", true);
    await passwordSignIn(page, user.email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/plan");
    const card = (name: string) =>
      page
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card("Dup run")
      .getByRole("button", { name: "Duplicate Dup run" })
      .click();
    await expect(card("Dup run (Copy)")).toBeVisible();
    await card("Dup run")
      .getByRole("button", { name: "Duplicate Dup run" })
      .click();
    await expect(card("Dup run (Copy 2)")).toBeVisible();
    // Same rewards, same order.
    const rows = card("Dup run (Copy)").locator("ol > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Altar'd State");

    // Free: no Duplicate control at all.
    const ctx = await browser.newContext(ownIp(21));
    const free = await ctx.newPage();
    const freeUser = await make("e2e-dup-free", false);
    await passwordSignIn(free, freeUser.email, PASSWORD);
    await expect(free).toHaveURL(/\/dashboard$/);
    await free.goto("/plan");
    await expect(
      free.getByRole("heading", { name: "Dup run", exact: true }),
    ).toBeVisible();
    await expect(free.getByRole("button", { name: /^Duplicate/ })).toHaveCount(
      0,
    );
    await ctx.close();
  } finally {
    await db.end();
  }
});
