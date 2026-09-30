import { expect, test, type Page } from "@playwright/test";

// These run at every screen size in playwright.config.ts.

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
}

async function insideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  const vp = page.viewportSize()!;
  expect(box, selector).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 0.5);
  return box!;
}

test.describe("table screen", () => {
  test("fits the window with no scrolling and uses the space it has", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hold'em Lab" })).toBeVisible();
    await noSidewaysScroll(page);
    const noScrollY = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
    expect(noScrollY).toBe(true);

    const table = await insideViewport(page, '[data-testid="table"]');
    const vp = page.viewportSize()!;
    const landscape = vp.width > vp.height;
    // The table takes its natural shape for the window: wide when the window is wide, tall when it is tall.
    if (landscape) expect(table.width).toBeGreaterThan(table.height * 1.5);
    else expect(table.height).toBeGreaterThan(table.width);
    // ...and fills most of the room rather than sitting small in the middle.
    const fill = landscape ? table.height / vp.height : table.width / vp.width;
    expect(fill).toBeGreaterThan(0.55);
    if (vp.width >= 1200) expect(table.width).toBeGreaterThan(700);
  });
});

test.describe("watch page", () => {
  test("lays out without sideways scrolling and keeps the controls on screen", async ({ page }) => {
    await page.goto("/#/watch");
    await expect(page.getByRole("heading", { name: "Watch the bots play" })).toBeVisible();
    await noSidewaysScroll(page);
    await insideViewport(page, 'button:has-text("Play 1 hand")');
    await insideViewport(page, 'button:has-text("Play 10 hands")');
  });

  test("plays a hand and shows a readable log", async ({ page }) => {
    await page.goto("/#/watch");
    await page.getByRole("button", { name: "Play 1 hand" }).click();
    const hand = page.getByTestId("logged-hand").first();
    await expect(hand).toContainText("Hand #1");
    await expect(hand).toContainText("posts the small blind");
    await expect(hand).toContainText("posts the big blind");
    await expect(hand).toContainText("Result:");
    await noSidewaysScroll(page);
    await hand.scrollIntoViewIfNeeded();
    await expect(hand).toBeVisible();
  });

  test("plays ten hands, newest first, and the chip total never changes", async ({ page }) => {
    await page.goto("/#/watch");
    const total = async () =>
      (await page.locator(".stacks tbody td.num").allTextContents()).reduce((sum, t) => sum + Number(t || 0), 0);
    const before = await total();
    await page.getByRole("button", { name: "Play 10 hands" }).click();
    await expect(page.getByTestId("logged-hand")).toHaveCount(10);
    await expect(page.getByTestId("logged-hand").first()).toContainText("Hand #10");
    // Nobody rebuys unless someone goes broke, so count rebuys into the expected total.
    // A rebuy line looks like "↻ Rebuy before this hand: Ben rebought 200, Fay rebought 200".
    const rebuyLines = await page.locator(".log-line.rebuy").allTextContents();
    const rebuys = rebuyLines.reduce((n, line) => n + (line.match(/rebought 200/g)?.length ?? 0), 0);
    expect(await total()).toBe(before + rebuys * 200);
    await noSidewaysScroll(page);
  });

  test("a rebuy line sits inside the hand it comes before, right under that hand's header", async ({ page }) => {
    await page.goto("/#/watch");
    await page.getByRole("button", { name: "Play 10 hands" }).click();
    const hands = page.getByTestId("logged-hand");
    let found = 0;
    for (let i = 0; i < (await hands.count()); i++) {
      const lines = await hands.nth(i).locator(".log-line").allTextContents();
      const at = lines.findIndex((l) => l.startsWith("↻"));
      if (at >= 0) {
        found++;
        expect(at).toBe(1);
        expect(lines[0]).toMatch(/^Hand #/);
        expect(lines[2]).toMatch(/^Stacks:/);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  test("the same seed deals the same hand, and a different seed does not", async ({ page }) => {
    const firstHand = async (seed: string) => {
      await page.goto("/#/watch");
      await page.getByLabel(/Shuffle seed/).fill(seed);
      await page.getByRole("button", { name: "Restart" }).click();
      await page.getByRole("button", { name: "Play 1 hand" }).click();
      return page.getByTestId("logged-hand").first().innerText();
    };
    const a = await firstHand("alpha");
    const b = await firstHand("alpha");
    const c = await firstHand("beta");
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  test("auto-play deals hands until it is stopped", async ({ page }) => {
    await page.goto("/#/watch");
    await page.getByRole("button", { name: "Auto-play" }).click();
    await expect(page.getByTestId("logged-hand").nth(1)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: "Stop auto-play" }).click();
    const count = await page.getByTestId("logged-hand").count();
    await page.waitForTimeout(2000);
    expect(await page.getByTestId("logged-hand").count()).toBe(count);
  });

  test("can go back to the table", async ({ page }) => {
    await page.goto("/#/watch");
    await page.getByRole("link", { name: /Table/ }).click();
    await expect(page.getByTestId("table")).toBeVisible();
  });
});
