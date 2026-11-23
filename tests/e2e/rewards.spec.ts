import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ownIp, passwordSignIn } from "./support";

// Its own client IP, so sign-ins don't share one per-IP budget (support.ts ownIp).
test.use(ownIp(17));

// My Rewards and the dashboard (BUILD F-4 "Tests": FR-12–FR-16, FR-21, NFR-3). One user and one
// sign-in (the per-IP sign-in limit, see onboarding.spec.ts); states come from changing the
// user's birthday and programs directly in the local database between page loads.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { adminClient, createUser, PASSWORD, sql } =
  await import("../rls/helpers");

const ZONE = "America/New_York";
const todayIn = (zone: string, plusDays = 0) => {
  const now = new Date(Date.now() + plusDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { month: get("month"), day: get("day") };
};

test("My Rewards: the list, filters, pages, and the other views (FR-12–FR-16, FR-21)", async ({
  page,
}) => {
  // Nothing on S-105 asks for the device's location (NFR-3).
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { geoCalls: string[] }).geoCalls = calls;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: () => calls.push("get"),
        watchPosition: () => calls.push("watch"),
      },
    });
  });

  const user = await createUser("e2e-rewards");
  const admin = adminClient();
  const setBirthday = async (b: { month: number; day: number }) => {
    const { error } = await admin
      .from("profiles")
      .update({ birth_month: b.month, birth_day: b.day, time_zone: ZONE })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
  };

  // 22 programs: one lasting only the birthday, the rest the whole birth month.
  const db = sql();
  const oneDay = await db<{ id: string; name: string }[]>`
    select id, name from public.retailers
    where retired_at is null and timing_type = 'from_birthday' and days_after = 1
    order by id limit 1`;
  const month = await db<{ id: string }[]>`
    select id from public.retailers
    where retired_at is null and timing_type = 'birth_month' order by id limit 21`;
  await db.end();
  expect(oneDay).toHaveLength(1);
  expect(month).toHaveLength(21);
  const ids = [oneDay[0]!.id, ...month.map((m) => m.id)];
  await setBirthday(todayIn(ZONE));
  const { error } = await admin
    .from("enrollments")
    .insert(ids.map((retailer_id) => ({ user_id: user.id, retailer_id })));
  if (error) throw new Error(error.message);

  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  // S-102: no pickups yet, and the link cards (FR-21).
  await expect(
    page.getByText("No pickups yet this Birthday Run."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /My Rewards See what's open now/ })
    .click();
  await expect(page).toHaveURL(/\/rewards$/);

  // Birthday today: the header, the counts, 20 per page, the 1-day reward first (FR-12, FR-14).
  await expect(
    page.getByRole("heading", { name: "Happy birthday", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Showing 22 of 22")).toBeVisible();
  const cards = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2 }) });
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText(oneDay[0]!.name);
  await expect(cards.first()).toContainText("Last day");
  await expect(cards.first()).toContainText("Ends soon");
  await expect(cards.first()).toContainText("Brands may end it early");

  // "Show more" is a plain link: the next page renders the first two pages (FR-13).
  await page.getByRole("link", { name: "Show more" }).click();
  await expect(cards).toHaveCount(22);
  await expect(page.getByRole("link", { name: "Show more" })).toHaveCount(0);

  // "Ends within 1 day" keeps only the 1-day reward; filters and the count combine (FR-13).
  await page.getByLabel("Ends within").selectOption("1");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Showing 1 of 22")).toBeVisible();
  await expect(cards).toHaveCount(1);

  // Three months ahead: M-207 with the opening date, and no list in the page (FR-15).
  await setBirthday(todayIn(ZONE, 92));
  await page.goto("/rewards");
  await expect(
    page.getByText(
      /^Your rewards open on .+\. Add programs or plan your run now\.$/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/days until your birthday$/)).toBeVisible();
  await expect(page.getByLabel("Search rewards")).toHaveCount(0);

  // No programs: M-211, in the window too (FR-16).
  await admin.from("enrollments").delete().eq("user_id", user.id);
  await setBirthday(todayIn(ZONE));
  await page.goto("/rewards");
  await expect(
    page.getByText(/^You haven't added any programs yet\./),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => (window as unknown as { geoCalls: string[] }).geoCalls,
    ),
  ).toEqual([]);
});
