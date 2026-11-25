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
      name: "Every birthday freebie, one run.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute(
    "href",
    "/sign-up",
  );
  await expect(
    page.getByRole("link", { name: "Browse rewards" }),
  ).toHaveAttribute("href", "/discover");
  await expect(page.getByText(/^\d+ brands waiting$/)).toBeVisible();
});
