import "../rls/load-env";
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { setPremium } from "../../scripts/grant-premium";
import { mailHeaders, newestMail, ownIp, passwordSignIn } from "./support";

// Reminder emails in a real browser and mailbox (BUILD F-12 "Tests": FR-41, FR-42, FR-39, D15).
// The cron and unsubscribe secrets come from the environment the server started with (CI
// generates both); without them these tests are skipped.
const { createUser, dayFromToday, PASSWORD, sql } =
  await import("../rls/helpers");

test.use(ownIp(24));
const CRON = process.env.CRON_SECRET;
const UNSUB = process.env.REMINDER_UNSUBSCRIBE_SECRET;

const db = sql();
test.afterAll(() => db.end());

/** The same token the server makes (src/server/reminders/unsubscribe-token.ts). */
const tokenFor = (userId: string) =>
  `v1.${userId}.${createHmac("sha256", UNSUB!).update(`reminders:${userId}`).digest("base64url")}`;

/** A premium user with a birthday `days` from today (UTC) and one program. */
async function premiumUser(label: string, days = 3, premium = true) {
  const user = await createUser(label);
  const [, month, day] = dayFromToday(days).split("-").map(Number);
  await db`update public.profiles set birth_month = ${month!}, birth_day = ${day!},
           time_zone = 'UTC' where id = ${user.id}`;
  await db`insert into public.enrollments (user_id, retailer_id) values (${user.id}, '16-handles')`;
  if (premium) await setPremium(db, user.email, "grant");
  return user;
}
const remindersOn = async (id: string) =>
  (
    await db<
      { on: boolean }[]
    >`select reminders_enabled as on from public.profiles where id = ${id}`
  )[0]!.on;
const signIn = async (page: Page, email: string) => {
  await passwordSignIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/rewards$/);
};

test("Settings: the reminders switch turns off and on and stays; free users get C-104 (FR-42, FR-39)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const user = await premiumUser("e2e-remind-settings");
  await signIn(page, user.email);
  await page.goto("/settings#reminders");
  const toggle = page.getByRole("switch", { name: "Birthday reminder emails" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(page.getByText("Reminders off.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await remindersOn(user.id)).toBe(false);
  await toggle.click();
  await expect(page.getByText("Reminders on.")).toBeVisible();
  expect(await remindersOn(user.id)).toBe(true);

  const ctx = await browser.newContext(ownIp(24));
  const free = await ctx.newPage();
  const freeUser = await premiumUser("e2e-remind-free", 3, false);
  await signIn(free, freeUser.email);
  await free.goto("/settings#reminders");
  await expect(
    free.getByText("Birthday reminder emails is part of Premium"),
  ).toBeVisible();
  await expect(free.getByRole("switch")).toHaveCount(0);
  await ctx.close();
});

test("Turn-off page: opening it changes nothing; the button turns reminders off; a bad token looks the same (FR-42, D15)", async ({
  page,
}) => {
  test.skip(!UNSUB, "REMINDER_UNSUBSCRIBE_SECRET not set for this run");
  const user = await premiumUser("e2e-remind-unsub");
  await page.goto(
    `/reminders/unsubscribe?token=${encodeURIComponent(tokenFor(user.id))}`,
  );
  await expect(
    page.getByRole("heading", { name: "Turn off reminder emails?" }),
  ).toBeVisible();
  expect(await remindersOn(user.id)).toBe(true); // GET never writes
  await page.getByRole("button", { name: "Turn off reminders" }).click();
  await expect(
    page.getByRole("heading", { name: "Reminders are off" }),
  ).toBeVisible();
  expect(await remindersOn(user.id)).toBe(false);

  await page.goto("/reminders/unsubscribe?token=v1.bad.bad");
  await page.getByRole("button", { name: "Turn off reminders" }).click();
  await expect(
    page.getByRole("heading", { name: "Reminders are off" }),
  ).toBeVisible();
});

test("The daily job: a plan-ahead email arrives with both List-Unsubscribe headers (FR-41, RFC 8058)", async ({
  request,
}) => {
  test.skip(
    !CRON || !UNSUB,
    "CRON_SECRET / REMINDER_UNSUBSCRIBE_SECRET not set for this run",
  );
  const user = await premiumUser("e2e-remind-cron");
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  const res = await request.get("/api/cron/reminders", {
    headers: { authorization: `Bearer ${CRON}` },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  expect(await res.json()).toMatchObject({ sent: expect.any(Number) });

  const mail = await newestMail(user.email, /^Time to plan your Birthday Run$/);
  expect(mail.html).toContain("16 Handles");
  expect(mail.html).toContain("/reminders/unsubscribe?token=");
  const headers = await mailHeaders(mail.id);
  expect(headers["List-Unsubscribe-Post"]).toEqual([
    "List-Unsubscribe=One-Click",
  ]);
  expect(headers["List-Unsubscribe"]?.[0]).toMatch(
    /^<http.*\/api\/reminders\/unsubscribe\?token=v1\./,
  );

  // A second call the same day sends nothing new for this user.
  await request.get("/api/cron/reminders", {
    headers: { authorization: `Bearer ${CRON}` },
  });
  const rows =
    await db`select count(*)::int as n from public.reminder_log where user_id = ${user.id}`;
  expect(rows[0]!.n).toBe(1);
});
