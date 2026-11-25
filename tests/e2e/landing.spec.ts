import { expect, test } from "@playwright/test";

// S-1 landing look (decision 0016, WCAG 2.2.2): the pause control, reduced motion, and the game's
// pull-up tab (a real button with aria-expanded, Escape closes it, play pauses the motion).
const stage = (page: import("@playwright/test").Page) =>
  page.locator(".motion-stage");

test("Pause motion stops the tunnel and glow; Play motion starts them", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
  const pause = page.getByRole("button", { name: "Pause motion" });
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await pause.click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  const state = await page
    .locator(".tunnel-tile")
    .first()
    .evaluate((e) => getComputedStyle(e).animationPlayState);
  expect(state).toBe("paused");
  await page.getByRole("button", { name: "Play motion" }).click();
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
});

test("reduced motion: the page starts paused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await expect(
    page.getByRole("button", { name: "Play motion" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the game tab opens and closes, and a round pauses the motion until it ends", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const tab = page.getByRole("button", { name: "Catch the prizes" });
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await tab.click();
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  const play = page.getByRole("button", { name: "Play 30 seconds" });
  await expect(play).toBeFocused();
  await play.click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await page.keyboard.press("ArrowLeft");
  // Escape closes the sheet mid-round; focus returns to the tab and the motion comes back.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Catch the prizes" }),
  ).toBeFocused();
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
});

test("the card: headline, both buttons and the brand count", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "How many free things can you get on your birthday?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Find my birthday freebies" }),
  ).toHaveAttribute("href", "/sign-up");
  await expect(
    page.getByRole("link", { name: "Browse rewards" }),
  ).toHaveAttribute("href", "/discover");
  await expect(
    page.getByText(/^\d+ brands waiting to treat you$/),
  ).toBeVisible();
});

test("S-4/S-5 look: tabs keep `next`, the current tab is marked, the reward is decoration", async ({
  page,
}) => {
  await page.goto("/sign-in?next=%2Fplan");
  const tabs = page.getByRole("navigation", {
    name: "Sign in or create an account",
  });
  await expect(tabs.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    tabs.getByRole("link", { name: "Create account" }),
  ).toHaveAttribute("href", "/sign-up?next=%2Fplan");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back" }),
  ).toBeVisible();
  // The rotating reward sits inside an aria-hidden box (not read every 2.6 s).
  const hidden = await page
    .getByText("Waiting for you")
    .evaluate((el) => el.closest("[aria-hidden='true']") !== null);
  expect(hidden).toBe(true);
  await tabs.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fplan$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create your account" }),
  ).toBeVisible();
});
