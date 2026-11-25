import "../rls/load-env";
import { expect, test } from "@playwright/test";
import { ownIp, passwordSignIn } from "./support";

// The report dialog in a real browser (BUILD F-13 "Tests": FR-48, C-107 on S-105 and S-104): a
// reason is required (M-199), sending shows the BR-20 toast, then the trigger reads M-198 for the
// rest of the cycle, and nothing but the reason is stored.
const { createUser, dayFromToday, PASSWORD, sql } =
  await import("../rls/helpers");

test.use(ownIp(25));

const db = sql();
test.afterAll(() => db.end());

test("report a reward: reason required, thanks, then Reported (FR-48)", async ({
  page,
}) => {
  const user = await createUser("e2e-report");
  const [, month, day] = dayFromToday(0).split("-").map(Number);
  await db`update public.profiles set birth_month = ${month!}, birth_day = ${day!},
           time_zone = 'UTC' where id = ${user.id}`;
  const [retailer] = await db<{ id: string; name: string }[]>`
    select id, name from public.retailers
    where retired_at is null and timing_type = 'birth_month' order by id limit 1`;
  await db`insert into public.enrollments (user_id, retailer_id)
           values (${user.id}, ${retailer!.id})`;

  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/rewards$/);
  await page.goto("/rewards");
  await expect(page.getByText(retailer!.name).first()).toBeVisible();

  await page
    .getByRole("button", { name: `More for ${retailer!.name}` })
    .click();
  await page.getByRole("menuitem", { name: "Report a problem" }).click();
  const dialog = page.getByRole("dialog", {
    name: `What's wrong with ${retailer!.name}'s reward?`,
  });
  await expect(dialog).toBeVisible();
  // C-107: four reasons in a labelled radio group, and no text field (NFR-11).
  await expect(dialog.getByRole("radio")).toHaveCount(4);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);

  // Escape closes it and focus goes back to "More" (SPEC §3.3 dialogs); then reopen.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const more = page.getByRole("button", { name: `More for ${retailer!.name}` });
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("menuitem", { name: "Report a problem" }).click();

  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByText("Choose a reason.")).toBeVisible();

  await dialog.getByRole("radio", { name: "The timing is wrong" }).check();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. We'll check it.")).toBeVisible();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("button", { name: `More for ${retailer!.name}` })
    .click();
  await expect(page.getByRole("menuitem", { name: "Reported" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // S-104 says the same after a fresh load.
  await page.goto(`/discover/${retailer!.id}`);
  await expect(page.getByText("Reported", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report a problem" }),
  ).toHaveCount(0);

  // S-104's button for another retailer: Cancel returns focus to it.
  const [other] = await db<{ id: string; name: string }[]>`
    select id, name from public.retailers
    where retired_at is null and id <> ${retailer!.id} order by id limit 1`;
  await page.goto(`/discover/${other!.id}`);
  const button = page.getByRole("button", { name: "Report a problem" });
  await button.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(button).toBeFocused();

  const rows =
    await db`select reason from public.reward_reports where user_id = ${user.id}`;
  expect(rows.map((r) => r.reason)).toEqual(["wrong_timing"]);
});
